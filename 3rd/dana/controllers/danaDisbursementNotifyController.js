import { db } from "../../../config/db.js";

import { danaPaymentConfig } from "../config/danaPayment.js";

import {
  getJakartaTimestamp,
  verifySnapSignature,
} from "../utils/danaSnapSignature.js";

import * as settlementModel from "../../../models/providerSettlementModel.js";

// ============================================================
// CONFIGURATION
// ============================================================

const NOTIFY_PATH = "/v1.0/debit/emoney/transfer-bank/notify.htm";

const VALID_STATUSES = new Set([
  "00", // Success
  "01", // Initiated
  "02", // Paying
  "03", // Pending
  "04", // Refunded
  "05", // Cancelled
  "06", // Failed
  "07", // Not Found
]);

// Maksimum selisih timestamp callback.
// Default 15 menit.
const DEFAULT_MAX_TIMESTAMP_AGE = 900;

// ============================================================
// RESPONSE HELPER
// ============================================================

function sendDanaResponse(res, httpStatus, responseCode, responseMessage) {
  res.set("X-TIMESTAMP", getJakartaTimestamp());

  return res.status(httpStatus).json({
    responseCode,
    responseMessage,
  });
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

function isNonEmptyString(value, maxLength = 64) {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maxLength
  );
}

function isValidTimestamp(timestamp) {
  if (
    typeof timestamp !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/.test(timestamp)
  ) {
    return false;
  }

  const parsed = Date.parse(timestamp);

  if (!Number.isFinite(parsed)) {
    return false;
  }

  const configuredAge = Number(
    process.env.DANA_NOTIFY_MAX_TIMESTAMP_AGE_SECONDS ||
      DEFAULT_MAX_TIMESTAMP_AGE,
  );

  const maxAge =
    Number.isFinite(configuredAge) &&
    configuredAge >= 60 &&
    configuredAge <= 3600
      ? configuredAge
      : DEFAULT_MAX_TIMESTAMP_AGE;

  return Math.abs(Date.now() - parsed) <= maxAge * 1000;
}

function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }

  return (
    isNonEmptyString(body.originalPartnerReferenceNo) &&
    isNonEmptyString(body.originalReferenceNo) &&
    typeof body.latestTransactionStatus === "string" &&
    VALID_STATUSES.has(body.latestTransactionStatus)
  );
}

// ============================================================
// FIND SETTLEMENT FROM DANA REFERENCE
// ============================================================

async function findSettlement(partnerReferenceNo) {
  const [rows] = await db.query(
    `
      SELECT
        id_provider_settlement,
        settlement_reference,
        payout_reference,
        net_amount,
        status
      FROM provider_settlements
      WHERE settlement_reference = ?
      LIMIT 1
    `,
    [partnerReferenceNo],
  );

  return rows[0] || null;
}

// ============================================================
// DANA TRANSFER BANK NOTIFY
// ============================================================

export async function transferBankNotify(req, res) {
  const timestamp = req.get("X-TIMESTAMP");
  const signature = req.get("X-SIGNATURE");
  const partnerId = req.get("X-PARTNER-ID");
  const externalId = req.get("X-EXTERNAL-ID");

  try {
    // ========================================================
    // 1. VALIDATE WEBHOOK CONFIGURATION
    // ========================================================

    if (process.env.DANA_DISBURSEMENT_NOTIFY_ENABLED !== "true") {
      return sendDanaResponse(res, 503, "5004301", "Internal Server Error");
    }

    if (!danaPaymentConfig.publicKey) {
      console.error("[DANA DISBURSEMENT NOTIFY] Public key not configured");

      return sendDanaResponse(res, 500, "5004301", "Internal Server Error");
    }

    // ========================================================
    // 2. VALIDATE REQUIRED HEADERS
    // ========================================================

    if (!timestamp || !signature || !partnerId || !externalId) {
      return sendDanaResponse(res, 401, "4014300", "Unauthorized");
    }

    const expectedPartnerId =
      process.env.DANA_DISBURSEMENT_NOTIFY_PARTNER_ID ||
      process.env.DANA_PARTNER_ID;

    if (!expectedPartnerId || partnerId !== expectedPartnerId) {
      console.warn("[DANA DISBURSEMENT NOTIFY] Partner ID mismatch");

      return sendDanaResponse(res, 401, "4014300", "Unauthorized");
    }

    if (!isNonEmptyString(externalId, 36) || !isValidTimestamp(timestamp)) {
      return sendDanaResponse(res, 400, "4004301", "Invalid Field Format");
    }

    // ========================================================
    // 3. VERIFY DANA SIGNATURE
    // ========================================================

    if (typeof req.rawBody !== "string") {
      console.error("[DANA DISBURSEMENT NOTIFY] Raw body unavailable");

      return sendDanaResponse(res, 500, "5004301", "Internal Server Error");
    }

    const signatureValid = verifySnapSignature({
      method: "POST",
      path: NOTIFY_PATH,
      rawBody: req.rawBody,
      timestamp,
      signature,
      publicKey: danaPaymentConfig.publicKey,
    });

    if (!signatureValid) {
      console.warn("[DANA DISBURSEMENT NOTIFY] Invalid signature");

      return sendDanaResponse(res, 401, "4014300", "Unauthorized");
    }

    // ========================================================
    // 4. VALIDATE PAYLOAD
    // ========================================================

    const body = req.body;

    if (!validatePayload(body)) {
      return sendDanaResponse(res, 400, "4004302", "Invalid Mandatory Field");
    }

    const partnerReferenceNo = body.originalPartnerReferenceNo;

    const referenceNo = body.originalReferenceNo;

    const transactionStatus = body.latestTransactionStatus;

    // ========================================================
    // 5. FIND SETTLEMENT
    // ========================================================

    const settlement = await findSettlement(partnerReferenceNo);

    if (!settlement) {
      console.warn("[DANA DISBURSEMENT NOTIFY] Unknown settlement reference");

      return sendDanaResponse(res, 400, "4004300", "Bad Request");
    }

    const id = Number(settlement.id_provider_settlement);

    // ========================================================
    // 6. VERIFY TRANSFER REFERENCE
    // ========================================================

    // Jika payout_reference sudah tersimpan,
    // referensi dari webhook harus sama.
    //
    // Jika masih NULL, inquiry cron akan
    // melakukan validasi ulang ke DANA.

    if (
      settlement.payout_reference &&
      String(settlement.payout_reference) !== String(referenceNo)
    ) {
      console.error("[DANA DISBURSEMENT NOTIFY] Transfer reference mismatch", {
        settlementId: id,
      });

      // Tidak langsung mengubah status ke SUCCESS.
      await settlementModel.markReview(id);

      return sendDanaResponse(res, 400, "4004300", "Bad Request");
    }

    // ========================================================
    // 7. IDEMPOTENCY
    // ========================================================

    // Settlement SUCCESS tidak boleh diproses
    // kembali ataupun mengurangi saldo dua kali.

    if (settlement.status === "SUCCESS") {
      console.log("[DANA DISBURSEMENT NOTIFY] Already successful", {
        settlementId: id,
      });

      return sendDanaResponse(res, 200, "2004300", "Successful");
    }

    // ========================================================
    // 8. DO NOT PROCESS UNCLAIMED SETTLEMENT
    // ========================================================

    if (settlement.status === "PENDING") {
      console.warn("[DANA DISBURSEMENT NOTIFY] Unclaimed settlement", {
        settlementId: id,
      });

      return sendDanaResponse(res, 409, "4004300", "Bad Request");
    }

    if (!["PROCESSING", "SUBMITTED", "REVIEW"].includes(settlement.status)) {
      return sendDanaResponse(res, 409, "4004300", "Bad Request");
    }

    // ========================================================
    // 9. PROCESS NOTIFICATION STATUS
    // ========================================================

    if (transactionStatus === "00") {
      // DANA melaporkan transfer sukses.
      //
      // Untuk keamanan:
      // Jangan langsung panggil finalizeSuccess().
      //
      // Tandai perlu reconciliation.
      // Cron inquiry existing akan memverifikasi
      // nominal, currency dan reference ke DANA
      // sebelum mengurangi balances.total_amount_dana.

      await settlementModel.markReview(id);

      console.log(
        "[DANA DISBURSEMENT NOTIFY] SUCCESS received, awaiting inquiry",
        { settlementId: id },
      );
    } else if (["04", "05", "06", "07"].includes(transactionStatus)) {
      // Status terminal bermasalah.
      // Masukkan ke REVIEW agar tidak ada
      // transfer ulang otomatis.

      await settlementModel.markReview(id);

      console.warn("[DANA DISBURSEMENT NOTIFY] Failed or uncertain transfer", {
        settlementId: id,
        transactionStatus,
      });
    } else {
      // 01, 02, 03 = masih diproses.
      // Biarkan cron melakukan pengecekan.

      console.log("[DANA DISBURSEMENT NOTIFY] Transfer pending", {
        settlementId: id,
        transactionStatus,
      });
    }

    // ========================================================
    // 10. ACKNOWLEDGE DANA
    // ========================================================

    return sendDanaResponse(res, 200, "2004300", "Successful");
  } catch (error) {
    console.error("[DANA DISBURSEMENT NOTIFY ERROR]", error);

    return sendDanaResponse(res, 500, "5004301", "Internal Server Error");
  }
}
