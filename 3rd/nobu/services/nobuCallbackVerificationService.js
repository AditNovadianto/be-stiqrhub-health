import { db } from "../../../config/db.js";
import { getNobuConfig } from "../config/nobu.js";
import { isValidNobuReference, nobuLog } from "../utils/nobuUtils.js";

const errorWithStatus = (
  message,
  status = 400,
  code = "CALLBACK_VALIDATION_ERROR",
) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const amountToCents = (value) => {
  const raw = String(value ?? "").trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw errorWithStatus(
      "Nominal pembayaran tidak valid",
      422,
      "INVALID_AMOUNT",
    );
  }

  const [whole, decimal = ""] = raw.split(".");

  return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
};

const parseObject = (value, field) => {
  if (value == null) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    throw errorWithStatus(
      `${field} tidak valid`,
      502,
      "INVALID_MIDDLEWARE_DATA",
    );
  }

  try {
    const parsed = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected object");
    }

    return parsed;
  } catch {
    throw errorWithStatus(
      `${field} bukan JSON valid`,
      502,
      "INVALID_MIDDLEWARE_JSON",
    );
  }
};

const parsePaidAt = (value) => {
  if (typeof value !== "string" || !value) {
    throw errorWithStatus(
      "Waktu pembayaran tidak tersedia",
      503,
      "PAID_AT_MISSING",
    );
  }

  // Tanggal dari middleware berbentuk ISO
  // dengan offset +07:00.
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw errorWithStatus(
      "Waktu pembayaran tidak valid",
      502,
      "INVALID_PAID_AT",
    );
  }

  if (date.getTime() > Date.now() + 60000) {
    throw errorWithStatus(
      "Waktu pembayaran berada di masa depan",
      502,
      "INVALID_PAID_AT",
    );
  }

  return date;
};

const getMiddlewareConfig = () => {
  const baseUrl = String(process.env.MIDDLEWARE_API_URL_DEV ?? "").replace(
    /\/+$/,
    "",
  );

  const apiKey = process.env.MIDDLEWARE_API_KEY;

  if (!baseUrl || !apiKey) {
    throw errorWithStatus(
      "Konfigurasi middleware belum lengkap",
      503,
      "MIDDLEWARE_NOT_CONFIGURED",
    );
  }

  const url = new URL(baseUrl);

  if (url.protocol !== "https:") {
    throw errorWithStatus(
      "Middleware harus menggunakan HTTPS",
      503,
      "INVALID_MIDDLEWARE_URL",
    );
  }

  return { baseUrl, apiKey };
};

// ======================================================
// GET CHECK STATUS FROM STIQR MIDDLEWARE
// ======================================================

const getMiddlewarePayment = async (reference) => {
  const { baseUrl, apiKey } = getMiddlewareConfig();

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const url = `${baseUrl}/nobu/check-status/` + encodeURIComponent(reference);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-API-Key": apiKey,
      },
      signal: controller.signal,
    });

    const result = await response.json();

    if (
      !response.ok ||
      result?.success !== true ||
      !result?.data ||
      typeof result.data !== "object" ||
      Array.isArray(result.data)
    ) {
      throw errorWithStatus(
        "Gagal mendapatkan data transaksi middleware",
        503,
        "MIDDLEWARE_STATUS_FAILED",
      );
    }

    return result.data;
  } catch (error) {
    if (error.status) {
      throw error;
    }

    throw errorWithStatus(
      `Gagal memeriksa middleware: ${error.message}`,
      503,
      "MIDDLEWARE_REQUEST_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
};

// ======================================================
// GET LOCAL ORDER
// ======================================================

const getLocalOrder = async (reference) => {
  const [rows] = await db.execute(
    `
      SELECT
        id_order,
        total,
        payment_method,
        payment_status,
        order_status,
        paid_at
      FROM orders
      WHERE id_order = ?
      LIMIT 1
    `,
    [reference],
  );

  return rows[0] ?? null;
};

// ======================================================
// VALIDATE CALLBACK + MIDDLEWARE PAYMENT
// ======================================================

export const verifyNobuPaidCallback = async (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw errorWithStatus("Payload callback tidak valid");
  }

  const reference = payload.originalPartnerReferenceNo;

  if (!isValidNobuReference(reference)) {
    throw errorWithStatus("Original partner reference tidak valid");
  }

  const callbackStatus = String(payload.latestTransactionStatus ?? "");

  if (!/^\d{2}$/.test(callbackStatus)) {
    throw errorWithStatus("Status callback tidak valid");
  }

  const order = await getLocalOrder(reference);

  if (!order) {
    throw errorWithStatus("Order tidak ditemukan", 404, "ORDER_NOT_FOUND");
  }

  if (order.payment_method !== "NOBU_QRIS") {
    throw errorWithStatus(
      "Payment method bukan NOBU QRIS",
      409,
      "PAYMENT_METHOD_MISMATCH",
    );
  }

  const config = getNobuConfig();

  // ====================================================
  // VALIDATE CALLBACK BODY
  // ====================================================

  if (payload.externalStoreId !== config.storeId) {
    throw errorWithStatus(
      "Store ID callback tidak cocok",
      409,
      "CALLBACK_STORE_MISMATCH",
    );
  }

  if (payload.additionalInfo?.merchantId !== config.merchantId) {
    throw errorWithStatus(
      "Merchant ID callback tidak cocok",
      409,
      "CALLBACK_MERCHANT_MISMATCH",
    );
  }

  if (payload.amount?.currency !== "IDR") {
    throw errorWithStatus(
      "Currency callback tidak sesuai",
      409,
      "CALLBACK_CURRENCY_MISMATCH",
    );
  }

  const orderAmount = amountToCents(order.total);

  const callbackAmount = amountToCents(payload.amount?.value);

  if (callbackAmount !== orderAmount) {
    throw errorWithStatus(
      "Nominal callback berbeda dengan order",
      409,
      "CALLBACK_AMOUNT_MISMATCH",
    );
  }

  // Status selain 00 tidak boleh disetujui.
  if (callbackStatus !== "00") {
    nobuLog.info("CALLBACK", "Non-success callback acknowledged", {
      reference,
      callbackStatus,
    });

    return {
      reference,
      order,
      approved: false,
      reason: "NON_SUCCESS_CALLBACK",
    };
  }

  // ====================================================
  // VERIFY THROUGH MIDDLEWARE
  // ====================================================

  const middleware = await getMiddlewarePayment(reference);

  if (middleware.partner_reference_no !== reference) {
    throw errorWithStatus(
      "Reference middleware tidak cocok",
      409,
      "MIDDLEWARE_REFERENCE_MISMATCH",
    );
  }

  const middlewareStatus = String(middleware.status ?? "").toLowerCase();

  const hasCallback = middleware.is_callback_received === true;

  const hasPaidAt = Boolean(middleware.paid_at);

  nobuLog.info("CALLBACK", "Middleware payment evidence", {
    reference,
    middlewareStatus,
    hasCallback,
    hasPaidAt,
    checkCount: middleware.check_count ?? null,
  });

  // Middleware yang sekarang teruji
  // menggunakan status "success", bukan "paid".
  //
  // PENTING: status success harus berasal dari
  // callback NOBU yang sudah diverifikasi infra.
  if (
    middlewareStatus !== "success" ||
    !hasCallback ||
    !hasPaidAt ||
    !middleware.callback_received_at
  ) {
    throw errorWithStatus(
      "Middleware belum mengonfirmasi pembayaran sukses",
      503,
      "PAYMENT_NOT_CONFIRMED",
    );
  }

  // ====================================================
  // CHECK GENERATE RESPONSE
  // ====================================================

  const generated = parseObject(
    middleware.generate_response,
    "generate_response",
  );

  if (!generated) {
    throw errorWithStatus(
      "Bukti Generate QRIS tidak tersedia",
      503,
      "GENERATE_EVIDENCE_MISSING",
    );
  }

  if (
    generated.responseCode !== "2004700" ||
    generated.partnerReferenceNo !== reference ||
    generated.merchantId !== config.merchantId ||
    generated.storeId !== config.storeId ||
    generated.subMerchantId !== config.subMerchantId
  ) {
    throw errorWithStatus(
      "Data Generate QRIS tidak cocok",
      409,
      "GENERATE_EVIDENCE_MISMATCH",
    );
  }

  // ====================================================
  // VALIDATE LAST INQUIRY DETAILS
  // ====================================================

  const inquiry = parseObject(
    middleware.last_query_response,
    "last_query_response",
  );

  if (!inquiry) {
    throw errorWithStatus(
      "Data inquiry tidak tersedia",
      503,
      "INQUIRY_EVIDENCE_MISSING",
    );
  }

  if (
    inquiry.responseCode !== "2005100" ||
    inquiry.originalPartnerReferenceNo !== reference
  ) {
    throw errorWithStatus(
      "Reference inquiry tidak cocok",
      409,
      "INQUIRY_REFERENCE_MISMATCH",
    );
  }

  if (inquiry.amount?.currency !== "IDR") {
    throw errorWithStatus(
      "Currency inquiry tidak cocok",
      409,
      "INQUIRY_CURRENCY_MISMATCH",
    );
  }

  if (amountToCents(inquiry.amount?.value) !== orderAmount) {
    throw errorWithStatus(
      "Nominal inquiry berbeda dengan order",
      409,
      "INQUIRY_AMOUNT_MISMATCH",
    );
  }

  // Hasil inquiry "01" bisa merupakan hasil
  // sebelum callback sukses diterima middleware.
  //
  // Karena itu status ini hanya dicatat.
  // Kita tidak menggunakannya sebagai bukti lunas.
  const inquiryStatus = String(inquiry.latestTransactionStatus ?? "");

  // Jangan menerima inquiry yang secara eksplisit
  // menyatakan status terminal negatif sebagai
  // bagian dari bukti pembayaran sukses.
  //
  // Untuk kontrak middleware saat ini kita hanya
  // menerima inquiry lama "01" atau sukses "00".
  if (!["00", "01"].includes(inquiryStatus)) {
    throw errorWithStatus(
      "Status inquiry tidak sesuai",
      409,
      "INQUIRY_STATUS_CONFLICT",
    );
  }

  const paidAt = parsePaidAt(middleware.paid_at);

  nobuLog.info("CALLBACK", "NOBU transaction verified through middleware", {
    reference,
    callbackStatus,
    middlewareStatus,
    inquiryStatus,
    amountMatches: true,
    merchantMatches: true,
    storeMatches: true,
    paidAt: paidAt.toISOString(),
  });

  return {
    reference,
    order,
    approved: true,
    alreadyApproved: order.payment_status === "APPROVED",
    paidAt,
    middlewareStatus,
    inquiryStatus,
  };
};
