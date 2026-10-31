import { db } from "../../../config/db.js";
import { nobuLog } from "../utils/nobuUtils.js";

const errorResponse = (res, status, message) => {
  return res.status(status).json({
    success: false,
    message,
  });
};

const parseInquiry = (value) => {
  if (!value) return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
};

async function getMiddlewareStatus(reference) {
  const baseUrl = String(process.env.MIDDLEWARE_API_URL_DEV || "").replace(
    /\/+$/,
    "",
  );

  const apiKey = process.env.MIDDLEWARE_API_KEY;

  if (!baseUrl.startsWith("https://") || !apiKey) {
    throw new Error("Middleware configuration missing");
  }

  const response = await fetch(
    `${baseUrl}/nobu/check-status/${encodeURIComponent(reference)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) {
    throw new Error(`Middleware returned HTTP ${response.status}`);
  }

  const result = await response.json();

  if (
    result?.success !== true ||
    !result.data ||
    result.data.partner_reference_no !== reference
  ) {
    throw new Error("Middleware transaction reference mismatch");
  }

  return result.data;
}

const hasPaymentEvidence = (remote) => {
  const status = String(remote?.status || "").toLowerCase();

  const inquiry = parseInquiry(remote?.last_query_response);

  return (
    ["success", "paid"].includes(status) ||
    Boolean(remote?.paid_at) ||
    inquiry?.latestTransactionStatus === "00"
  );
};

const isFinalUnpaid = (remote) => {
  const status = String(remote?.status || "").toLowerCase();

  return (
    ["expired", "failed", "cancelled", "canceled"].includes(status) &&
    !hasPaymentEvidence(remote)
  );
};

// ======================================================
// CANCEL PAYMENT
// ======================================================

export const cancelNobuQrisController = async (req, res) => {
  const reference = String(req.params.id_order || "");

  const customerId = Number(req.nobuCustomerId);

  if (
    !/^E2E-MID-\d+$/.test(reference) ||
    !Number.isSafeInteger(customerId) ||
    customerId <= 0
  ) {
    return errorResponse(res, 400, "ID transaksi atau customer tidak valid.");
  }

  // ====================================================
  // 1. VERIFY ORDER OWNERSHIP
  // ====================================================

  try {
    const [orders] = await db.execute(
      `
        SELECT
          id_order,
          id_customer,
          payment_method,
          payment_status,
          order_status
        FROM orders
        WHERE id_order = ?
        LIMIT 1
      `,
      [reference],
    );

    const order = orders[0];

    if (
      !order ||
      Number(order.id_customer) !== customerId ||
      order.payment_method !== "NOBU_QRIS"
    ) {
      return errorResponse(res, 404, "Pesanan tidak ditemukan.");
    }

    if (
      order.payment_status === "APPROVED" ||
      order.order_status === "APPROVED"
    ) {
      return res.status(409).json({
        success: false,
        message: "Pembayaran sudah berhasil. Pesanan tidak dapat dibatalkan.",
        data: {
          id_order: reference,
          payment_status: "APPROVED",
          cancellation_status: "PAYMENT_DETECTED",
        },
      });
    }

    if (order.payment_status === "FAILED") {
      return res.status(200).json({
        success: true,
        message: "Pembayaran sudah ditutup.",
        data: {
          id_order: reference,
          payment_status: "FAILED",
          cancellation_status: "CONFIRMED",
          can_leave: true,
        },
      });
    }
  } catch (error) {
    nobuLog.error("CANCEL", "Failed to verify order ownership", error, {
      reference,
    });

    return errorResponse(res, 500, "Gagal memeriksa pesanan.");
  }

  // ====================================================
  // 2. CHECK MIDDLEWARE
  // ====================================================

  let remote = null;

  try {
    remote = await getMiddlewareStatus(reference);
  } catch (error) {
    nobuLog.warn("CANCEL", "Middleware status unavailable", {
      reference,
      errorMessage: error.message,
    });
  }

  // ====================================================
  // 3. DATABASE TRANSACTION
  // ====================================================

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
        SELECT
          id_order,
          id_customer,
          payment_method,
          payment_status,
          order_status
        FROM orders
        WHERE id_order = ?
        FOR UPDATE
      `,
      [reference],
    );

    const order = rows[0];

    if (
      !order ||
      Number(order.id_customer) !== customerId ||
      order.payment_method !== "NOBU_QRIS"
    ) {
      await connection.rollback();

      return errorResponse(res, 404, "Pesanan tidak ditemukan.");
    }

    // ==================================================
    // 4. ALREADY APPROVED
    // ==================================================

    if (
      order.payment_status === "APPROVED" ||
      order.order_status === "APPROVED"
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Pembayaran sudah berhasil. Tidak dapat dibatalkan.",
        data: {
          id_order: reference,
          payment_status: "APPROVED",
          cancellation_status: "PAYMENT_DETECTED",
        },
      });
    }

    // ==================================================
    // 5. ALREADY FAILED
    // ==================================================

    if (order.payment_status === "FAILED") {
      await connection.commit();

      return res.status(200).json({
        success: true,
        message: "Pembayaran sudah ditutup.",
        data: {
          id_order: reference,
          payment_status: "FAILED",
          cancellation_status: "CONFIRMED",
          can_leave: true,
        },
      });
    }

    // ==================================================
    // 6. REMOTE PAYMENT DETECTED
    // ==================================================

    if (remote && hasPaymentEvidence(remote)) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Pembayaran sudah terdeteksi. Tunggu proses konfirmasi pembayaran.",
        data: {
          id_order: reference,
          payment_status: order.payment_status,
          cancellation_status: "PAYMENT_DETECTED",
        },
      });
    }

    const eligibleStatuses = ["INITIATING", "PENDING", "UNKNOWN"];

    if (!eligibleStatuses.includes(order.payment_status)) {
      await connection.rollback();

      return errorResponse(
        res,
        409,
        "Status pembayaran tidak dapat dibatalkan.",
      );
    }

    // ==================================================
    // 7. REMOTE EXPIRED / FAILED
    // ==================================================

    if (remote && isFinalUnpaid(remote)) {
      await connection.execute(
        `
          UPDATE orders
          SET
            payment_status = 'FAILED',
            order_status = 'FAILED',
            payment_updated_at = NOW()
          WHERE id_order = ?
        `,
        [reference],
      );

      await connection.commit();

      nobuLog.info("CANCEL", "Payment closed as FAILED", {
        reference,
        remoteStatus: remote.status,
      });

      return res.status(200).json({
        success: true,
        message: "Pembayaran berhasil dibatalkan.",
        data: {
          id_order: reference,
          payment_status: "FAILED",
          cancellation_status: "CONFIRMED",
          can_leave: true,
        },
      });
    }

    // ==================================================
    // 8. ACTIVE QRIS: REQUEST CANCELLATION
    // ==================================================

    // QRIS yang masih aktif belum dibatalkan
    // pada jaringan pembayaran.
    //
    // Karena itu payment_status tetap PENDING.
    // order_status mencatat keinginan customer
    // untuk membatalkan / keluar.

    if (order.order_status !== "CANCEL_REQUESTED") {
      await connection.execute(
        `
          UPDATE orders
          SET
            order_status = 'CANCEL_REQUESTED',
            payment_updated_at = NOW()
          WHERE id_order = ?
        `,
        [reference],
      );
    }

    await connection.commit();

    nobuLog.info("CANCEL", "Customer cancellation requested", {
      reference,
      paymentStatus: order.payment_status,
      remoteStatus: remote?.status || "unavailable",
    });

    return res.status(200).json({
      success: true,
      message:
        "Permintaan pembatalan dicatat. Kamu dapat meninggalkan halaman pembayaran.",
      data: {
        id_order: reference,
        payment_status: order.payment_status,
        cancellation_status: "REQUESTED",
        can_leave: true,
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        nobuLog.error("CANCEL", "Rollback failed", rollbackError, {
          reference,
        });
      }
    }

    nobuLog.error("CANCEL", "Cancellation failed", error, { reference });

    return errorResponse(res, 500, "Gagal memproses permintaan pembatalan.");
  } finally {
    connection?.release();
  }
};
