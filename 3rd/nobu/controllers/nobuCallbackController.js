import * as orderModel from "../../../models/orderModel.js";

import * as healthPassesModel from "../../../models/healthPassesModel.js";

import { sendHealthPassEmail } from "../../../utils/mailer.js";

import { generateQrToken } from "../../../controllers/healthPassesController.js";

import { verifyNobuPaidCallback } from "../services/nobuCallbackVerificationService.js";

import { nobuLog } from "../utils/nobuUtils.js";

// ======================================================
// CALLBACK ACKNOWLEDGEMENT
// ======================================================

const sendAcknowledgement = (res) => {
  return res.status(200).json({
    responseCode: "2005200",
    responseMessage: "Request has been processed successfully",
  });
};

// ======================================================
// SEND HEALTH PASS EMAIL
// ======================================================

const sendHealthPassNotification = async (orderId) => {
  const order = await orderModel.getOrderById(orderId);

  if (!order) {
    throw new Error("Order tidak ditemukan setelah pembayaran");
  }

  if (!order.email_customer) {
    throw new Error("Email customer tidak tersedia");
  }

  const healthPass = await healthPassesModel.getHealthPassByOrder(orderId);

  if (!healthPass) {
    throw new Error("Health Pass tidak ditemukan setelah approval");
  }

  const qrToken = generateQrToken(healthPass);

  await sendHealthPassEmail({
    email: order.email_customer,
    name: order.name_customer,
    orderId: order.id_order,
    serviceName: order.name_service,
    providerName: order.name_provider,
    bookingAt: order.booking_at,
    total: order.total,
    healthPassId: healthPass.id_health_pass,
    validUntil: healthPass.valid_until,
    qrToken,
  });
};

// ======================================================
// CALLBACK CONTROLLER
// ======================================================

export const nobuQrisCallbackController = async (req, res) => {
  const payload = req.body;

  const reference = payload?.originalPartnerReferenceNo ?? null;

  const callbackStatus = payload?.latestTransactionStatus ?? null;

  nobuLog.info("CALLBACK", "NOBU callback received", {
    reference,
    callbackStatus,
  });

  try {
    // ==================================================
    // 1. VERIFY CALLBACK THROUGH MIDDLEWARE
    // ==================================================

    const verification = await verifyNobuPaidCallback(payload);

    if (!verification.approved) {
      nobuLog.info("CALLBACK", "Callback acknowledged without approval", {
        reference,
        reason: verification.reason,
      });

      return sendAcknowledgement(res);
    }

    // ==================================================
    // 2. ALREADY APPROVED
    // ==================================================

    if (verification.alreadyApproved) {
      nobuLog.info("CALLBACK", "Order already approved", { reference });

      return sendAcknowledgement(res);
    }

    // ==================================================
    // 3. APPROVE + FULFILL
    // ==================================================

    const result = await orderModel.processPaymentCallback({
      id_order: verification.reference,

      payment_status: "APPROVED",
      order_status: "APPROVED",

      // NOBU bukan transaksi DANA.
      dana_payment_id: null,

      paid_at: verification.paidAt,
      payment_expired_at: null,
    });

    nobuLog.info("FULFILLMENT", "NOBU payment fulfillment completed", {
      reference,
      paymentStatus: result.payment_status,
      orderStatus: result.order_status,
      firstApproval: result.first_payment_approval,
      balanceUpdated: result.balance_updated,
      quotaUpdated: result.quota_updated,
      healthPassCreated: result.health_pass_created,
    });

    // ==================================================
    // 4. SEND EMAIL AFTER DATABASE COMMIT
    // ==================================================

    if (result.notification_required) {
      try {
        await sendHealthPassNotification(verification.reference);

        nobuLog.info("EMAIL", "Health Pass email sent", { reference });
      } catch (emailError) {
        nobuLog.error("EMAIL", "Failed to send Health Pass email", emailError, {
          reference,
        });

        // Payment telah COMMIT.
        // Jangan ulang fulfillment karena
        // kegagalan SMTP.
        //
        // Retry email harus menggunakan
        // mekanisme terpisah yang persisten.
      }
    }

    // ==================================================
    // 5. ACKNOWLEDGEMENT
    // ==================================================

    return sendAcknowledgement(res);
  } catch (error) {
    nobuLog.error("CALLBACK", "NOBU callback processing failed", error, {
      reference,
      errorCode: error.code ?? null,
    });

    const errorStatus = Number(error.status ?? error.statusCode);

    const httpStatus = [400, 404, 409, 422].includes(errorStatus)
      ? errorStatus
      : 503;

    // Jangan ACK sukses apabila verifikasi
    // atau transaksi database belum berhasil.
    return res.status(httpStatus).json({
      responseCode: "5005200",
      responseMessage: "Callback processing could not be completed",
    });
  }
};
