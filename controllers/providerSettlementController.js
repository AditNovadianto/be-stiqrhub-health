import * as settlementModel from "../models/providerSettlementModel.js";

import {
  inquireTransferStatus,
  classifyInquiryResult,
} from "../3rd/dana/services/danaSettlementService.js";

// ERROR HANDLER
const handleError = (res, error) => {
  console.error("[PROVIDER SETTLEMENT]", error);

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode ? error.message : "Internal server error",
  });
};

// GET ALL
export const getAllProviderSettlements = async (req, res) => {
  try {
    const data = await settlementModel.getAllSettlements();

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET BY ID
export const getProviderSettlementById = async (req, res) => {
  try {
    const settlement = await settlementModel.getSettlementById(req.params.id);

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: "Settlement tidak ditemukan",
      });
    }

    const orders = await settlementModel.getSettlementOrders(req.params.id);

    return res.status(200).json({
      success: true,
      data: {
        ...settlement,
        orders,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GENERATE H+1 BATCHES
export const generateProviderSettlements = async (req, res) => {
  try {
    const result = await settlementModel.generateAllSettlements();

    return res.status(200).json({
      success: result.errors.length === 0,
      message: "Pembentukan settlement H+1 selesai",
      created_count: result.created.length,
      created: result.created,
      errors: result.errors,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// RECONCILE SETTLEMENT
export const reconcileProviderSettlement = async (req, res) => {
  try {
    const payout = await settlementModel.getReconciliationPayoutData(
      req.params.id,
    );

    if (!payout) {
      return res.status(409).json({
        success: false,
        message: "Settlement belum masuk proses transfer atau tidak ditemukan",
      });
    }

    const inquiry = await inquireTransferStatus(payout);

    const status = classifyInquiryResult(inquiry);

    let finalized = null;

    // Only finalize verified DANA response.
    if (
      status === "SUCCESS" &&
      inquiry.data?.originalPartnerReferenceNo ===
        payout.settlement_reference &&
      String(inquiry.data?.amount?.value) ===
        Number(payout.net_amount).toFixed(2) &&
      inquiry.data?.amount?.currency === "IDR"
    ) {
      finalized = await settlementModel.finalizeSuccess(
        req.params.id,
        inquiry.data?.originalReferenceNo || payout.payout_reference || null,
      );
    } else if (status === "SUCCESS") {
      await settlementModel.markReview(req.params.id);
      return res.status(409).json({
        success: false,
        message: "Referensi atau nominal inquiry tidak cocok dengan settlement",
      });
    } else if (["FAILED", "UNKNOWN"].includes(status)) {
      await settlementModel.markReview(req.params.id);
    }

    return res.status(200).json({
      success: true,
      id_provider_settlement: Number(req.params.id),
      inquiry_status: status,
      response_code: inquiry.responseCode,
      transaction_status: inquiry.data?.latestTransactionStatus ?? null,
      finalized,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
