import {
  getJakartaTimestamp,
  createExternalId,
  generateSnapSignature,
} from "../utils/danaSnapSignature.js";

import { danaPaymentConfig } from "../config/danaPayment.js";

const TRANSFER_PATH = "/v1.0/emoney/transfer-bank.htm";
const STATUS_PATH = "/v1.0/emoney/transfer-bank-status.htm";

const makeError = (message, statusCode = 502) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const formatMoney = (value) => {
  const str = String(value);

  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw makeError("Nominal payout tidak valid", 422);
  }

  const [integer, decimal = ""] = str.split(".");
  return `${integer}.${decimal.padEnd(2, "0")}`;
};

// ============================================================
// DANA CONFIG
// ============================================================

function validateConfig() {
  const required = [
    "DANA_BASE_URL",
    "DANA_PARTNER_ID",
    "DANA_CHANNEL_ID",
    "DANA_PRIVATE_KEY",
  ];

  const missing = required.filter((name) => !process.env[name]);

  if (missing.length) {
    throw makeError(
      `Konfigurasi DANA belum lengkap: ${missing.join(", ")}`,
      500,
    );
  }

  if (!danaPaymentConfig.privateKey) {
    throw makeError("Private key DANA tidak valid", 500);
  }
}

// ============================================================
// SEND SNAP REQUEST
// ============================================================

async function requestDana(path, payload) {
  validateConfig();

  const timestamp = getJakartaTimestamp();
  const rawBody = JSON.stringify(payload);

  const signature = generateSnapSignature({
    method: "POST",
    path,
    rawBody,
    timestamp,
    privateKey: danaPaymentConfig.privateKey,
  });

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-TIMESTAMP": timestamp,
    "X-SIGNATURE": signature,
    "X-PARTNER-ID": danaPaymentConfig.partnerId,
    "X-EXTERNAL-ID": createExternalId(),
    "CHANNEL-ID": danaPaymentConfig.channelId,
  };

  if (danaPaymentConfig.origin) {
    headers.ORIGIN = danaPaymentConfig.origin;
  }

  const baseUrl = String(danaPaymentConfig.baseUrl).replace(/\/+$/, "");

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: rawBody,
      signal: controller.signal,
    });

    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw makeError("DANA mengembalikan response non-JSON");
    }

    return {
      httpStatus: response.status,
      responseCode: data.responseCode || null,
      responseMessage: data.responseMessage || null,
      data,
    };
  } catch (error) {
    throw makeError(`Status komunikasi DANA belum pasti: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// TRANSFER TO BANK
// ============================================================

export async function transferToBank(payout) {
  if (process.env.DANA_DISBURSEMENT_ENABLED !== "true") {
    throw makeError("DANA Disbursement belum diaktifkan", 403);
  }

  const bankCode = String(payout.bank_code);
  const accountNumber = String(payout.account_number);
  const reference = String(payout.settlement_reference);

  if (
    bankCode.length > 8 ||
    accountNumber.length > 32 ||
    reference.length > 64
  ) {
    throw makeError(
      "Data rekening atau referensi melewati batas API DANA",
      422,
    );
  }

  const body = {
    partnerReferenceNo: reference,
    beneficiaryAccountNumber: accountNumber,
    beneficiaryBankCode: bankCode,
    amount: {
      value: formatMoney(payout.net_amount),
      currency: "IDR",
    },
    additionalInfo: {
      fundType: "MERCHANT_WITHDRAW_FOR_CORPORATE",
      chargeTarget: process.env.DANA_DISBURSEMENT_CHARGE_TARGET || "MERCHANT",
      needNotify: false,
      beneficiaryAccountName: String(payout.account_holder_name).slice(0, 64),
    },
  };

  return requestDana(TRANSFER_PATH, body);
}

// ============================================================
// TRANSFER STATUS INQUIRY
// ============================================================

export async function inquireTransferStatus(payout) {
  const serviceCode = process.env.DANA_TRANSFER_INQUIRY_SERVICE_CODE || "00";

  if (!["00", "43"].includes(serviceCode)) {
    throw makeError("DANA_TRANSFER_INQUIRY_SERVICE_CODE tidak valid", 500);
  }

  const body = {
    originalPartnerReferenceNo: String(payout.settlement_reference),
    serviceCode,
  };

  if (payout.payout_reference) {
    body.originalReferenceNo = String(payout.payout_reference);
  }

  return requestDana(STATUS_PATH, body);
}

// ============================================================
// CLASSIFY INITIAL TRANSFER
// ============================================================

export function classifyTransferResponse(response) {
  if (["2004300", "2024300"].includes(response.responseCode)) {
    return "SUBMITTED";
  }

  return "REVIEW";
}

// ============================================================
// CLASSIFY STATUS INQUIRY
// ============================================================

export function classifyInquiryResult(response) {
  if (response.responseCode !== "2000000") {
    return "UNKNOWN";
  }

  const status = String(response.data?.latestTransactionStatus ?? "");

  if (status === "00") {
    return "SUCCESS";
  }

  if (["01", "03"].includes(status)) {
    return "PENDING";
  }

  if (["04", "05", "06", "07"].includes(status)) {
    return "FAILED";
  }

  return "UNKNOWN";
}
