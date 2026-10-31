// 3rd/controllers/danaPaymentController.js

import {
  createDanaPayment,
  processDanaFinishNotify,
} from "../services/danaPaymentService.js";

import { danaPaymentConfig } from "../config/danaPayment.js";

import { verifySnapSignature } from "../utils/danaSnapSignature.js";

import * as orderModel from "../../../models/orderModel.js";

import { generateQrToken } from "../../../controllers/healthPassesController.js";

import { sendHealthPassEmail } from "../../../utils/mailer.js";

// Uncomment this to debug the public key fingerprint if needed
// import crypto from "crypto";

// function getPublicKeyFingerprint(publicKey) {
//   const der = publicKey.export({
//     type: "spki",
//     format: "der",
//   });

//   return crypto.createHash("sha256").update(der).digest("hex");
// }

function logSection(title, payload) {
  console.log("\n============================================================");

  console.log(title);

  if (payload !== undefined) {
    console.dir(payload, {
      depth: null,
      colors: true,
    });
  }

  console.log("============================================================\n");
}

function handleError(res, error) {
  logSection("[DANA PAYMENT ERROR]", {
    statusCode: error.statusCode || 500,

    message: error.message,

    danaResponseCode: error.danaResponseCode || null,
  });

  return res.status(error.statusCode || 500).json({
    success: false,

    message: error.message || "Internal server error",

    ...(error.danaResponseCode
      ? {
          danaResponseCode: error.danaResponseCode,
        }
      : {}),
  });
}

// ============================================================
// CREATE PAYMENT
// ============================================================

export async function createPayment(req, res) {
  try {
    const { id_order, device_id } = req.body || {};

    logSection("[DANA CREATE PAYMENT REQUEST RECEIVED]", {
      id_order,

      device_id,

      id_customer: req.user?.id_customer || null,
    });

    if (typeof id_order !== "string" || !id_order.trim()) {
      return res.status(400).json({
        success: false,

        message: "ID order wajib diisi",
      });
    }

    if (typeof device_id !== "string" || !device_id.trim()) {
      return res.status(400).json({
        success: false,

        message: "Device ID wajib diisi",
      });
    }

    if (!req.user || !req.user.id_customer) {
      return res.status(401).json({
        success: false,

        message: "Customer tidak terautentikasi",
      });
    }

    const result = await createDanaPayment({
      idOrder: id_order.trim(),

      idCustomer: req.user.id_customer,

      deviceId: device_id.trim(),
    });

    return res.status(200).json({
      success: true,

      message: "DANA payment berhasil dibuat",

      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// ============================================================
// FINISH NOTIFY
// ============================================================

export async function finishNotify(req, res) {
  const timestamp = req.headers["x-timestamp"];
  const signature = req.headers["x-signature"];

  logSection("[DANA FINISH NOTIFY RECEIVED]", {
    method: req.method,
    path: req.originalUrl,
    headers: {
      "x-timestamp": timestamp || null,
      "x-signature": signature ? "***MASKED***" : null,
      "x-partner-id": req.headers["x-partner-id"] || null,
      "x-external-id": req.headers["x-external-id"] || null,
    },
  });

  try {
    if (!timestamp || !signature) {
      return res.status(401).json({
        responseCode: "4015600",
        responseMessage: "Unauthorized",
      });
    }

    if (!danaPaymentConfig.publicKey) {
      throw new Error("DANA_PUBLIC_KEY belum dikonfigurasi");
    }

    if (!req.rawBody) {
      throw new Error("Raw request body tidak tersedia");
    }

    const signatureValid = verifySnapSignature({
      method: "POST",
      path: "/v1.0/debit/notify",
      rawBody: req.rawBody,
      timestamp,
      signature,
      publicKey: danaPaymentConfig.publicKey,
    });

    logSection("[DANA FINISH NOTIFY SIGNATURE CHECK]", {
      valid: signatureValid,
      timestamp,
      path: "/v1.0/debit/notify",
      rawBodyLength: Buffer.byteLength(req.rawBody, "utf8"),
    });

    if (!signatureValid) {
      return res.status(401).json({
        responseCode: "4015600",
        responseMessage: "Unauthorized",
      });
    }

    const result = await processDanaFinishNotify(req.body);

    logSection("[DANA FINISH NOTIFY PROCESSED]", {
      id_order: result.id_order,
      payment_status: result.payment_status,
      order_status: result.order_status,
      quota_updated: result.quota_updated,
      balance_updated: result.balance_updated,
      health_pass_created: result.health_pass_created,
      first_payment_approval: result.first_payment_approval,
      notification_required: result.notification_required,
    });

    const shouldSendEmail =
      result.payment_status === "APPROVED" &&
      result.order_status === "APPROVED" &&
      result.first_payment_approval === true &&
      result.notification_required === true;

    if (shouldSendEmail) {
      try {
        console.log("[PAYMENT EMAIL START]", {
          id_order: result.id_order,
        });

        const order = await orderModel.getOrderById(result.id_order);

        if (!order) {
          throw new Error("Order tidak ditemukan setelah pembayaran");
        }

        // CUSTOMER -> email_customer
        // GUEST    -> email_guest
        // Field recipient_* sudah disediakan orderModel.

        const recipientEmail =
          typeof order.recipient_email === "string"
            ? order.recipient_email.trim()
            : "";

        const recipientName =
          typeof order.recipient_name === "string" &&
          order.recipient_name.trim()
            ? order.recipient_name.trim()
            : "Pelanggan";

        if (!recipientEmail) {
          throw new Error("Email penerima Health Pass tidak tersedia");
        }

        console.log("[PAYMENT EMAIL RECIPIENT]", {
          id_order: order.id_order,
          recipient_type: order.recipient_type,
          recipient_email: recipientEmail,
        });

        const healthPass = result.health_pass;

        if (!healthPass?.id_health_pass) {
          throw new Error("Health Pass tidak tersedia setelah pembayaran");
        }

        const qrToken = generateQrToken({
          ...healthPass,
          id_order: result.id_order,
          id_service: order.id_service,
          id_provider: order.id_provider,
        });

        const mailInfo = await sendHealthPassEmail({
          email: recipientEmail,
          name: recipientName,
          orderId: order.id_order,
          serviceName: order.name_service,
          providerName: order.name_provider,
          bookingAt: order.booking_at,
          total: order.total,
          healthPassId: healthPass.id_health_pass,
          validUntil: healthPass.valid_until,
          qrToken,
        });

        console.log("[PAYMENT EMAIL SMTP RESULT]", {
          id_order: result.id_order,
          messageId: mailInfo.messageId || null,
          accepted: mailInfo.accepted || [],
          rejected: mailInfo.rejected || [],
        });

        const recipientAccepted =
          Array.isArray(mailInfo.accepted) &&
          mailInfo.accepted.some(
            (email) =>
              typeof email === "string" &&
              email.toLowerCase() === recipientEmail.toLowerCase(),
          );

        if (!recipientAccepted) {
          throw new Error("SMTP tidak menerima email penerima Health Pass");
        }

        console.log("[PAYMENT EMAIL SUCCESS]", {
          id_order: result.id_order,
          recipient_type: order.recipient_type,
          recipient_email: recipientEmail,
        });
      } catch (emailError) {
        // Pembayaran DANA sudah berhasil dan COMMIT.
        // Kegagalan email tidak membatalkan pembayaran.

        console.error("[PAYMENT EMAIL ERROR]", {
          id_order: result.id_order,
          code: emailError.code || null,
          message: emailError.message,
          stack: emailError.stack,
        });
      }
    } else {
      console.log("[PAYMENT EMAIL SKIPPED]", {
        id_order: result.id_order,
        payment_status: result.payment_status,
        first_payment_approval: result.first_payment_approval,
        notification_required: result.notification_required,
      });
    }

    return res.status(200).json({
      responseCode: "2005600",
      responseMessage: "Successful",
    });
  } catch (error) {
    logSection("[DANA FINISH NOTIFY ERROR]", {
      message: error.message,
      code: error.code || null,
    });

    return res.status(500).json({
      responseCode: "5005601",
      responseMessage: "Internal Server Error",
    });
  }
}
