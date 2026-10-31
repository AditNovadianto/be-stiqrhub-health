import { getNobuConfig } from "../config/nobu.js";

import {
  generateNobuQris,
  checkNobuQrisStatus,
} from "../services/nobuMiddlewareService.js";

import {
  createNobuOrder,
  findNobuOrderById,
  verifyNobuOrderOwnership,
  updateNobuOrderStatus,
} from "../models/nobuQrisModel.js";

import {
  validateNobuBookingAt,
  isValidNobuReference,
  nobuLog,
} from "../utils/nobuUtils.js";

// ============================================
// ERROR RESPONSE
// ============================================

const sendError = (res, error, details = {}) => {
  nobuLog.error("CONTROLLER", "Request failed", error, details);

  const httpStatus =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 502;

  return res.status(httpStatus).json({
    success: false,

    message:
      httpStatus < 500 ? error.message : "Proses NOBU QRIS belum berhasil",

    ...(error.data ? { data: error.data } : {}),

    ...(process.env.NODE_ENV === "development"
      ? {
          error: {
            stage: error.stage ?? null,
            httpStatus: error.httpStatus ?? null,
            responseCode: error.responseCode ?? null,
            responseMessage: error.responseMessage ?? null,
          },
        }
      : {}),
  });
};

// ============================================
// CREATE QRIS
// ============================================

export const createNobuQrisController = async (req, res) => {
  const customerId = req.nobuCustomerId;

  const {
    id_service,
    booking_at,
    recipient = "SELF",
    id_guest,
  } = req.body ?? {};

  const serviceId = Number(id_service);

  if (!Number.isSafeInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({
      success: false,
      message: "id_service tidak valid",
    });
  }

  if (!["SELF", "GUEST"].includes(recipient)) {
    return res.status(400).json({
      success: false,
      message: "recipient harus SELF atau GUEST",
    });
  }

  const guestId = recipient === "GUEST" ? Number(id_guest) : null;

  if (
    recipient === "GUEST" &&
    (!Number.isSafeInteger(guestId) || guestId <= 0)
  ) {
    return res.status(400).json({
      success: false,
      message: "id_guest tidak valid",
    });
  }

  let bookingAt;

  try {
    bookingAt = validateNobuBookingAt(booking_at);

    // Pastikan konfigurasi siap sebelum INSERT.
    getNobuConfig();
  } catch (error) {
    return sendError(res, error);
  }

  let order = null;
  let qris = null;

  try {
    order = await createNobuOrder({
      customerId,
      serviceId,
      recipient,
      guestId,
      bookingAt,
    });

    // ========================================
    // GENERATE VIA MIDDLEWARE
    // ========================================

    try {
      qris = await generateNobuQris({
        orderId: order.id_order,
        amount: order.amount,
      });
    } catch (error) {
      nobuLog.error("GENERATE", "Generate QRIS failed", error, {
        reference: order.id_order,
        amount: order.amount,
      });

      try {
        await updateNobuOrderStatus({
          orderId: order.id_order,
          status: "UNKNOWN",
        });
      } catch (dbError) {
        nobuLog.error("DATABASE", "Unable to save UNKNOWN status", dbError, {
          reference: order.id_order,
        });

        return res.status(503).json({
          success: false,
          message:
            "Generate QRIS belum pasti dan status database gagal diperbarui.",
          data: {
            id_order: order.id_order,
            payment_status: "UNVERIFIED",
            can_retry: false,
          },
        });
      }

      return res.status(502).json({
        success: false,
        message: "Generate QRIS belum berhasil dikonfirmasi.",
        data: {
          id_order: order.id_order,
          payment_method: "NOBU_QRIS",
          payment_status: "UNKNOWN",
          can_retry: false,
        },

        ...(process.env.NODE_ENV === "development"
          ? {
              error: {
                stage: error.stage ?? null,
                httpStatus: error.httpStatus ?? null,
                responseCode: error.responseCode ?? null,
                responseMessage: error.responseMessage ?? null,
              },
            }
          : {}),
      });
    }

    // ========================================
    // GENERATE SUCCESS -> PENDING
    // ========================================

    await updateNobuOrderStatus({
      orderId: order.id_order,
      status: "PENDING",
    });

    return res.status(201).json({
      success: true,
      message: "NOBU QRIS berhasil dibuat",

      data: {
        id_order: order.id_order,

        partner_reference_no: qris.partnerReferenceNo,

        payment_method: "NOBU_QRIS",
        payment_status: "PENDING",

        amount: order.amount,
        currency: "IDR",

        qr_content: qris.qrContent,
        qr_url: qris.qrUrl,

        merchant_name: qris.merchantName,

        expired_at: null,
      },
    });
  } catch (error) {
    // Kesalahan sebelum order berhasil dibuat.
    if (!order) {
      return sendError(res, error, {
        customerId,
        serviceId,
      });
    }

    // Jika QR sudah diterbitkan tetapi proses
    // database berikutnya gagal, jangan retry.
    nobuLog.error("DATABASE", "Order requires reconciliation", error, {
      reference: order.id_order,
      qrGenerated: Boolean(qris),
    });

    return res.status(503).json({
      success: false,
      message:
        "Status transaksi belum berhasil dipastikan. Perlu rekonsiliasi.",

      data: {
        id_order: order.id_order,
        payment_status: "UNVERIFIED",
        can_retry: false,
      },
    });
  }
};

// ============================================
// CHECK PAYMENT STATUS
// ============================================

export const checkNobuQrisController = async (req, res) => {
  const orderId = req.params.id_order;
  const customerId = req.nobuCustomerId;

  if (!isValidNobuReference(orderId)) {
    return res.status(400).json({
      success: false,
      message: "ID order tidak valid",
    });
  }

  try {
    const order = await findNobuOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan",
      });
    }

    const isOwner = await verifyNobuOrderOwnership(order, customerId);

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "Akses order ditolak",
      });
    }

    if (order.payment_method !== "NOBU_QRIS") {
      return res.status(400).json({
        success: false,
        message: "Order bukan pembayaran NOBU QRIS",
      });
    }

    // Status final atau belum siap diinquiry.
    if (["INITIATING", "FAILED", "PAID"].includes(order.payment_status)) {
      return res.json({
        success: true,
        message: "Status order berhasil diperiksa",
        data: {
          id_order: orderId,
          payment_method: "NOBU_QRIS",
          payment_status: order.payment_status,
          paid_at: order.paid_at,
          can_retry: false,
        },
      });
    }

    const result = await checkNobuQrisStatus({
      orderId,
    });

    // UNKNOWN -> PENDING hanya bila inquiry
    // NOBU membuktikan status Initiated.
    if (order.payment_status === "UNKNOWN" && result.generatedEvidence) {
      await updateNobuOrderStatus({
        orderId,
        status: "PENDING",
      });
    }

    const current = await findNobuOrderById(orderId);

    return res.json({
      success: true,
      message: "Status middleware berhasil diperiksa",

      data: {
        id_order: orderId,
        payment_method: "NOBU_QRIS",
        payment_status: current.payment_status,

        middleware_status: result.middlewareStatus,

        nobu_status_code: result.inquiryStatus,

        has_inquiry_evidence: result.hasInquiryEvidence,

        payment_confirmation: result.paidEvidence
          ? "REQUIRES_VERIFICATION"
          : "NOT_CONFIRMED",

        check_count: result.checkCount,
        last_checked_at: result.lastCheckedAt,
        is_callback_received: result.isCallbackReceived,

        can_retry: false,
      },
    });
  } catch (error) {
    return sendError(res, error, {
      reference: orderId,
    });
  }
};
