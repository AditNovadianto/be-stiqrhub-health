import cron from "node-cron";
import { db } from "../config/db.js";

import * as settlementModel from "../models/providerSettlementModel.js";

import {
  transferToBank,
  inquireTransferStatus,
  classifyTransferResponse,
  classifyInquiryResult,
} from "../3rd/dana/services/danaSettlementService.js";

let cycleRunning = false;
let reconciliationRunning = false;
let cronStarted = false;

// ============================================================
// GENERATE H+1 BATCHES
// ============================================================

export async function generateDailySettlements() {
  const result = await settlementModel.generateAllSettlements();

  for (const settlement of result.created) {
    console.log(
      "[SETTLEMENT CREATED]",
      settlement.id_provider_settlement,
      "Provider:",
      settlement.id_provider,
      "Amount:",
      settlement.net_amount,
    );
  }

  for (const error of result.errors) {
    console.error(
      "[SETTLEMENT CREATE ERROR]",
      error.id_provider,
      error.message,
    );
  }

  return result;
}

// ============================================================
// PROCESS PENDING BANK TRANSFERS
// ============================================================

export async function processPendingSettlements() {
  if (process.env.DANA_DISBURSEMENT_ENABLED !== "true") {
    console.log("[SETTLEMENT] Bank transfer disabled; batch only");
    return;
  }

  const [rows] = await db.query(
    `
      SELECT id_provider_settlement
      FROM provider_settlements
      WHERE status = 'PENDING'
      ORDER BY settlement_date ASC
      LIMIT 100
    `,
  );

  for (const row of rows) {
    const id = Number(row.id_provider_settlement);

    try {
      const claimed = await settlementModel.claimSettlement(id);

      if (!claimed) continue;

      const payout = await settlementModel.getPayoutData(id);

      const response = await transferToBank(payout);

      const state = classifyTransferResponse(response);

      if (state === "SUBMITTED") {
        await settlementModel.markSubmitted(
          id,
          response.data?.referenceNo || null,
        );

        console.log("[DANA TRANSFER SUBMITTED]", id, response.responseCode);
      } else {
        await settlementModel.markReview(id);

        console.warn("[DANA TRANSFER NEEDS REVIEW]", id, response.responseCode);
      }
    } catch (error) {
      // Jika terjadi timeout setelah request diterima DANA,
      // jangan kirim ulang secara otomatis.
      await settlementModel.markReview(id).catch((dbError) => {
        console.error("[SETTLEMENT MARK REVIEW ERROR]", dbError);
      });

      console.error("[DANA TRANSFER ERROR]", id, error.message);
    }
  }
}

// ============================================================
// RECONCILE PENDING TRANSFERS
// ============================================================

export async function reconcilePendingSettlements() {
  if (process.env.DANA_DISBURSEMENT_ENABLED !== "true") {
    return;
  }

  if (reconciliationRunning) {
    return;
  }

  reconciliationRunning = true;

  try {
    const ids = await settlementModel.getReconciliationQueue();

    for (const id of ids) {
      try {
        const payout = await settlementModel.getReconciliationPayoutData(id);

        if (!payout) continue;

        const response = await inquireTransferStatus(payout);

        const status = classifyInquiryResult(response);

        if (status === "SUCCESS") {
          const inquiryRef = response.data?.originalPartnerReferenceNo;

          const inquiryAmount = response.data?.amount?.value;

          const inquiryCurrency = response.data?.amount?.currency;

          // Cegah pemrosesan jika inquiry merujuk
          // ke transaksi atau nominal berbeda.
          const validReference = inquiryRef === payout.settlement_reference;

          const validAmount =
            /^\d+(\.\d{1,2})?$/.test(String(payout.net_amount)) &&
            String(inquiryAmount) === Number(payout.net_amount).toFixed(2);

          if (!validReference || !validAmount || inquiryCurrency !== "IDR") {
            await settlementModel.markReview(id);

            console.error("[SETTLEMENT MISMATCH]", id);
            continue;
          }

          const result = await settlementModel.finalizeSuccess(
            id,
            response.data?.originalReferenceNo ||
              payout.payout_reference ||
              null,
          );

          console.log("[SETTLEMENT SUCCESS]", id, result);
        } else if (["FAILED", "UNKNOWN"].includes(status)) {
          await settlementModel.markReview(id);

          console.warn("[SETTLEMENT REVIEW]", id, status);
        } else {
          console.log("[SETTLEMENT AWAITING RESULT]", id, status);
        }
      } catch (error) {
        console.error("[SETTLEMENT RECONCILE ERROR]", id, error.message);
      }
    }
  } finally {
    reconciliationRunning = false;
  }
}

// ============================================================
// RUN DAILY SETTLEMENT CYCLE
// ============================================================

export async function runSettlementCycle() {
  if (cycleRunning) {
    console.log("[SETTLEMENT] Another cycle is still running");
    return;
  }

  cycleRunning = true;

  try {
    console.log("[SETTLEMENT CRON START]", new Date().toISOString());

    await generateDailySettlements();

    await processPendingSettlements();

    await reconcilePendingSettlements();

    console.log("[SETTLEMENT CRON COMPLETE]");
  } catch (error) {
    console.error("[SETTLEMENT CRON ERROR]", error);
  } finally {
    cycleRunning = false;
  }
}

// ============================================================
// START CRON JOBS
// ============================================================

export function startProviderSettlementCron() {
  if (cronStarted) {
    return;
  }

  if (process.env.SETTLEMENT_CRON_ENABLED !== "true") {
    console.log("[SETTLEMENT] Cron disabled");
    return;
  }

  cronStarted = true;

  const timezone = "Asia/Jakarta";

  // Primary H+1: 08:00 WIB.
  cron.schedule(
    process.env.SETTLEMENT_MAIN_CRON || "0 8 * * *",
    runSettlementCycle,
    {
      timezone,
      noOverlap: true,
    },
  );

  // Catch-up H+1: 10:00 WIB.
  cron.schedule(
    process.env.SETTLEMENT_RETRY_CRON || "0 10 * * *",
    runSettlementCycle,
    {
      timezone,
      noOverlap: true,
    },
  );

  // Reconciliation: every 15 minutes.
  cron.schedule(
    process.env.SETTLEMENT_INQUIRY_CRON || "*/15 * * * *",
    reconcilePendingSettlements,
    {
      timezone,
      noOverlap: true,
    },
  );

  console.log("[SETTLEMENT] H+1 cron at 08:00 & 10:00 WIB");

  console.log("[SETTLEMENT] DANA inquiry every 15 minutes");
}
