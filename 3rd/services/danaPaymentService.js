// 3rd/services/danaPaymentService.js

import * as orderModel from "../../models/orderModel.js";

import { db } from "../../config/db.js";

import { decryptToken } from "../utils/tokenCrypto.js";

import {
  danaPaymentConfig,
  validateDanaPaymentConfig,
} from "../config/danaPayment.js";

import {
  getJakartaTimestamp,
  createExternalId,
  generateSnapSignature,
} from "../utils/danaSnapSignature.js";

const PAYMENT_PATH =
  "/rest/redirection/v1.0/debit/payment-host-to-host";

const APPLY_OTT_PATH =
  "/rest/v1.1/qr/apply-ott";

// ============================================================
// ERROR HELPER
// ============================================================

function errorWithStatus(
  message,
  statusCode = 500,
  danaResponseCode = null
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.danaResponseCode = danaResponseCode;

  return error;
}

// ============================================================
// LOGGING HELPERS
// ============================================================

function maskValue(
  value,
  visibleStart = 8,
  visibleEnd = 6
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const stringValue = String(value);

  if (
    stringValue.length <=
    visibleStart + visibleEnd
  ) {
    return "***";
  }

  return (
    stringValue.slice(
      0,
      visibleStart
    ) +
    "..." +
    stringValue.slice(
      -visibleEnd
    )
  );
}

function maskUrl(value) {
  if (!value) {
    return value;
  }

  try {
    const url = new URL(value);

    const sensitiveParams = [
      "sign",
      "ott",
      "token",
      "accessToken",
      "access_token",
    ];

    for (const key of sensitiveParams) {
      if (
        url.searchParams.has(key)
      ) {
        const current =
          url.searchParams.get(key);

        url.searchParams.set(
          key,
          maskValue(current)
        );
      }
    }

    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeHeaders(
  headers = {}
) {
  const result = {
    ...headers,
  };

  if (
    result["X-SIGNATURE"]
  ) {
    result["X-SIGNATURE"] =
      maskValue(
        result["X-SIGNATURE"],
        10,
        6
      );
  }

  if (
    result[
      "Authorization-Customer"
    ]
  ) {
    result[
      "Authorization-Customer"
    ] =
      "Bearer ***MASKED***";
  }

  return result;
}

function sanitizeObject(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      sanitizeObject
    );
  }

  if (
    typeof value !== "object"
  ) {
    return value;
  }

  const result = {};

  for (
    const [
      key,
      item,
    ] of Object.entries(value)
  ) {
    const normalizedKey =
      key.toLowerCase();

    if (
      normalizedKey ===
        "access_token" ||
      normalizedKey ===
        "accesstoken" ||
      normalizedKey ===
        "refresh_token" ||
      normalizedKey ===
        "refreshtoken" ||
      normalizedKey ===
        "ott"
    ) {
      result[key] =
        maskValue(item);

      continue;
    }

    if (
      normalizedKey === "value" &&
      value.resourceType === "OTT"
    ) {
      result[key] =
        maskValue(item);

      continue;
    }

    if (
      normalizedKey.includes(
        "redirecturl"
      )
    ) {
      result[key] =
        maskUrl(item);

      continue;
    }

    result[key] =
      sanitizeObject(item);
  }

  return result;
}

function logSection(
  title,
  payload
) {
  console.log(
    "\n============================================================"
  );

  console.log(title);

  if (
    payload !== undefined
  ) {
    console.dir(
      payload,
      {
        depth: null,
        colors: true,
      }
    );
  }

  console.log(
    "============================================================\n"
  );
}

// ============================================================
// GENERAL HELPERS
// ============================================================

function addMinutes(
  date,
  minutes
) {
  return new Date(
    date.getTime() +
      minutes *
        60 *
        1000
  );
}

function formatDanaDate(date) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Asia/Jakarta",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        second:
          "2-digit",

        hour12:
          false,
      }
    );

  const parts =
    formatter.formatToParts(
      date
    );

  const value = {};

  for (
    const part of parts
  ) {
    value[part.type] =
      part.value;
  }

  return (
    `${value.year}-${value.month}-${value.day}` +
    `T${value.hour}:${value.minute}:${value.second}+07:00`
  );
}

function toMysqlDate(date) {
  return date
    .toISOString()
    .slice(
      0,
      19
    )
    .replace(
      "T",
      " "
    );
}

function normalizeAmount(value) {
  const amount =
    Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw errorWithStatus(
      "Total order tidak valid",
      500
    );
  }

  return amount.toFixed(2);
}

// ============================================================
// GET CUSTOMER DANA ACCESS TOKEN
// ============================================================

async function getCustomerDanaAccessToken(
  idCustomer
) {
  const [rows] =
    await db.query(
      `
        SELECT
          access_token,
          access_token_expires_at
        FROM customer_auth
        WHERE id_customer = ?
        LIMIT 1
      `,
      [
        idCustomer,
      ]
    );

  if (
    rows.length === 0
  ) {
    throw errorWithStatus(
      "Customer belum menghubungkan akun DANA",
      409
    );
  }

  const customerAuth =
    rows[0];

  if (
    !customerAuth.access_token
  ) {
    throw errorWithStatus(
      "Access token DANA tidak tersedia",
      409
    );
  }

  if (
    customerAuth
      .access_token_expires_at
  ) {
    const expiredAt =
      new Date(
        customerAuth
          .access_token_expires_at
      );

    if (
      !Number.isNaN(
        expiredAt.getTime()
      ) &&
      expiredAt <=
        new Date()
    ) {
      throw errorWithStatus(
        "Access token DANA customer sudah expired",
        401
      );
    }
  }

  try {
    const token =
      decryptToken(
        customerAuth
          .access_token
      );

    logSection(
      "[DANA CUSTOMER TOKEN READY]",
      {
        idCustomer,

        token:
          maskValue(token),

        expiresAt:
          customerAuth
            .access_token_expires_at,
      }
    );

    return token;
  } catch (error) {
    throw errorWithStatus(
      "Access token DANA tidak dapat dibaca",
      500
    );
  }
}

// ============================================================
// GENERIC SNAP REQUEST
// ============================================================

async function danaSnapRequest({
  path,
  body,
  customerAccessToken = null,
  deviceId = null,
}) {
  const rawBody =
    JSON.stringify(body);

  const timestamp =
    getJakartaTimestamp();

  const externalId =
    createExternalId();

  const signature =
    generateSnapSignature({
      method:
        "POST",

      path,

      rawBody,

      timestamp,

      privateKey:
        danaPaymentConfig
          .privateKey,
    });

  const headers = {
    "Content-Type":
      "application/json",

    "X-TIMESTAMP":
      timestamp,

    "X-SIGNATURE":
      signature,

    "X-PARTNER-ID":
      danaPaymentConfig
        .partnerId,

    "X-EXTERNAL-ID":
      externalId,

    "CHANNEL-ID":
      danaPaymentConfig
        .channelId,
  };

  if (
    danaPaymentConfig.origin
  ) {
    headers.ORIGIN =
      danaPaymentConfig.origin;
  }

  if (
    customerAccessToken
  ) {
    headers[
      "Authorization-Customer"
    ] =
      `Bearer ${customerAccessToken}`;
  }

  if (
    deviceId
  ) {
    headers[
      "X-DEVICE-ID"
    ] =
      deviceId;
  }

  const url =
    `${danaPaymentConfig.baseUrl}${path}`;

  logSection(
    "[DANA OUTGOING REQUEST]",
    {
      method:
        "POST",

      path,

      url,

      timestamp,

      externalId,

      headers:
        sanitizeHeaders(
          headers
        ),

      body:
        sanitizeObject(
          body
        ),
    }
  );

  const startedAt =
    Date.now();

  let response;

  try {
    response =
      await fetch(
        url,
        {
          method:
            "POST",

          headers,

          body:
            rawBody,

          signal:
            AbortSignal.timeout(
              15000
            ),
        }
      );
  } catch (error) {
    logSection(
      "[DANA NETWORK ERROR]",
      {
        path,

        message:
          error.message,

        durationMs:
          Date.now() -
          startedAt,
      }
    );

    throw errorWithStatus(
      "Tidak dapat terhubung ke DANA",
      502
    );
  }

  const responseText =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(
        responseText
      );
  } catch {
    throw errorWithStatus(
      "Response DANA bukan JSON valid",
      502
    );
  }

  logSection(
    "[DANA INCOMING RESPONSE]",
    {
      path,

      httpStatus:
        response.status,

      responseCode:
        data.responseCode ||
        null,

      responseMessage:
        data.responseMessage ||
        null,

      durationMs:
        Date.now() -
        startedAt,

      body:
        sanitizeObject(data),
    }
  );

  return {
    httpStatus:
      response.status,

    data,
  };
}

// ============================================================
// APPLY OTT
// ============================================================

async function applyOtt({
  accessToken,
  deviceId,
}) {
  if (
    typeof deviceId !==
      "string" ||
    !deviceId.trim()
  ) {
    throw errorWithStatus(
      "Device ID wajib diisi untuk Apply OTT",
      400
    );
  }

  const normalizedDeviceId =
    deviceId.trim();

  const body = {
    userResources: [
      "OTT",
    ],

    additionalInfo: {
      accessToken,
    },
  };

  const {
    data,
  } =
    await danaSnapRequest({
      path:
        APPLY_OTT_PATH,

      body,

      customerAccessToken:
        accessToken,

      deviceId:
        normalizedDeviceId,
    });

  if (
    data.responseCode !==
    "2004900"
  ) {
    throw errorWithStatus(
      data.responseMessage ||
        "Apply OTT DANA gagal",

      502,

      data.responseCode ||
        null
    );
  }

  const resource =
    Array.isArray(
      data.userResources
    )
      ? data.userResources.find(
          (item) =>
            item.resourceType ===
            "OTT"
        )
      : null;

  if (
    !resource ||
    !resource.value
  ) {
    throw errorWithStatus(
      "OTT tidak ditemukan pada response DANA",
      502
    );
  }

  logSection(
    "[DANA APPLY OTT SUCCESS]",
    {
      responseCode:
        data.responseCode,

      resourceType:
        resource.resourceType,

      ott:
        maskValue(
          resource.value
        ),

      deviceId:
        normalizedDeviceId,
    }
  );

  return {
    ott:
      resource.value,

    raw:
      data,
  };
}

// ============================================================
// CREATE DANA PAYMENT - BINDING
// ============================================================

export async function createDanaPayment({
  idOrder,
  idCustomer,
  deviceId,
}) {
  validateDanaPaymentConfig();

  logSection(
    "[DANA CREATE PAYMENT START]",
    {
      flow:
        "BINDING",

      idOrder,

      idCustomer,

      deviceId,
    }
  );

  if (
    typeof idOrder !==
      "string" ||
    !idOrder.trim()
  ) {
    throw errorWithStatus(
      "ID order wajib diisi",
      400
    );
  }

  if (
    typeof deviceId !==
      "string" ||
    !deviceId.trim()
  ) {
    throw errorWithStatus(
      "Device ID wajib diisi",
      400
    );
  }

  // ==========================================================
  // GET ORDER
  // ==========================================================

  const order =
    await orderModel
      .getOrderById(
        idOrder.trim()
      );

  if (!order) {
    throw errorWithStatus(
      "Order tidak ditemukan",
      404
    );
  }

  logSection(
    "[DANA ORDER DATA]",
    {
      id_order:
        order.id_order,

      id_customer:
        order.id_customer,

      id_service:
        order.id_service,

      name_service:
        order.name_service,

      payment_method:
        order.payment_method,

      payment_status:
        order.payment_status,

      order_status:
        order.order_status,

      total:
        order.total,

      dana_payment_id:
        order.dana_payment_id ||
        null,
    }
  );

  // ==========================================================
  // VALIDATE CUSTOMER
  // ==========================================================

  if (
    Number(
      order.id_customer
    ) !==
    Number(
      idCustomer
    )
  ) {
    throw errorWithStatus(
      "Order bukan milik customer ini",
      403
    );
  }

  if (
    String(
      order.payment_method
    ).toUpperCase() !==
    "DANA"
  ) {
    throw errorWithStatus(
      "Payment method order bukan DANA",
      409
    );
  }

  if (
    order.payment_status !==
      "PENDING" ||
    order.order_status !==
      "PENDING"
  ) {
    throw errorWithStatus(
      "Order tidak dalam status PENDING",
      409
    );
  }

  if (
    order.dana_payment_id
  ) {
    throw errorWithStatus(
      "Payment DANA untuk order ini sudah dibuat",
      409
    );
  }

  // ==========================================================
  // DANA CUSTOMER ACCESS TOKEN
  // ==========================================================

  const accessToken =
    await getCustomerDanaAccessToken(
      idCustomer
    );

  // ==========================================================
  // EXPIRY
  // ==========================================================

  const expiryMinutes =
    Number(
      danaPaymentConfig
        .expiryMinutes
    );

  if (
    !Number.isFinite(
      expiryMinutes
    ) ||
    expiryMinutes <= 0
  ) {
    throw errorWithStatus(
      "DANA_PAYMENT_EXPIRY_MINUTES tidak valid",
      500
    );
  }

  const expiredAt =
    addMinutes(
      new Date(),
      expiryMinutes
    );

  // ==========================================================
  // 1. DIRECT DEBIT PAYMENT - BINDING
  // ==========================================================

  const paymentBody = {
    partnerReferenceNo:
      order.id_order,

    merchantId:
      danaPaymentConfig
        .merchantId,

    validUpTo:
      formatDanaDate(
        expiredAt
      ),

    amount: {
      value:
        normalizeAmount(
          order.total
        ),

      currency:
        "IDR",
    },

    urlParams: [
      {
        url:
          danaPaymentConfig
            .notifyUrl,

        type:
          "NOTIFICATION",

        isDeeplink:
          "N",
      },
    ],

    additionalInfo: {
      productCode:
        danaPaymentConfig
          .productCode,

      order: {
        orderTitle:
          String(
            order.name_service ||
              "STIQR Health Service"
          ).slice(
            0,
            64
          ),
      },

      mcc:
        danaPaymentConfig
          .mcc,

      /**
       * Mengikuti reference support
       * DANA untuk Mini Program.
       */
      envInfo: {
        sourcePlatform:
          "IPG",

        terminalType:
          "MINI_PROGRAM",

        orderTerminalType:
          "APP",
      },
    },
  };

  logSection(
    "[DANA PAYMENT BODY READY]",
    paymentBody
  );

  const {
    data:
      paymentResponse,
  } =
    await danaSnapRequest({
      path:
        PAYMENT_PATH,

      body:
        paymentBody,
    });

  if (
    paymentResponse
      .responseCode !==
    "2005400"
  ) {
    throw errorWithStatus(
      paymentResponse
        .responseMessage ||
        "Create payment DANA gagal",

      422,

      paymentResponse
        .responseCode ||
        null
    );
  }

  if (
    !paymentResponse
      .referenceNo
  ) {
    throw errorWithStatus(
      "referenceNo tidak tersedia dari DANA",
      502
    );
  }

  if (
    !paymentResponse
      .webRedirectUrl
  ) {
    throw errorWithStatus(
      "webRedirectUrl tidak tersedia dari DANA",
      502
    );
  }

  // ==========================================================
  // 2. SAVE DANA REFERENCE
  // ==========================================================

  const updated =
    await orderModel
      .updateDanaPaymentInfo(
        order.id_order,

        paymentResponse
          .referenceNo,

        toMysqlDate(
          expiredAt
        )
      );

  if (!updated) {
    throw errorWithStatus(
      "Gagal menyimpan informasi payment DANA",
      500
    );
  }

  // ==========================================================
  // 3. APPLY OTT
  // ==========================================================

  const ottResponse =
    await applyOtt({
      accessToken,

      deviceId:
        deviceId.trim(),
    });

  // ==========================================================
  // 4. RESULT
  // ==========================================================

  /**
   * IMPORTANT:
   *
   * Dokumentasi DANA Binding memang
   * meminta webRedirectUrl + OTT untuk
   * menghasilkan complete payment URL.
   *
   * Namun kita tidak akan menebak format
   * concatenation manual sampai format
   * exact dikonfirmasi support DANA.
   *
   * Jadi backend mengembalikan keduanya.
   */

  const result = {
    id_order:
      order.id_order,

    dana_payment_id:
      paymentResponse
        .referenceNo,

    partner_reference_no:
      paymentResponse
        .partnerReferenceNo ||
      order.id_order,

    payment_status:
      "PENDING",

    order_status:
      "PENDING",

    payment_expired_at:
      expiredAt,

    web_redirect_url:
      paymentResponse
        .webRedirectUrl,

    ott:
      ottResponse.ott,
  };

  logSection(
    "[DANA CREATE PAYMENT COMPLETE]",
    {
      flow:
        "BINDING",

      id_order:
        result.id_order,

      dana_payment_id:
        result
          .dana_payment_id,

      partner_reference_no:
        result
          .partner_reference_no,

      payment_status:
        result
          .payment_status,

      order_status:
        result
          .order_status,

      payment_expired_at:
        result
          .payment_expired_at,

      web_redirect_url:
        maskUrl(
          result
            .web_redirect_url
        ),

      ott:
        maskValue(
          result.ott
        ),
    }
  );

  return result;
}

// ============================================================
// PROCESS FINISH NOTIFY
// ============================================================

export async function processDanaFinishNotify(
  payload
) {
  logSection(
    "[DANA FINISH NOTIFY PROCESS START]",
    sanitizeObject(
      payload
    )
  );

  const {
    originalPartnerReferenceNo,
    originalReferenceNo,
    merchantId,
    amount,
    latestTransactionStatus,
    finishedTime,
  } =
    payload || {};

  if (
    !originalPartnerReferenceNo ||
    !originalReferenceNo ||
    !merchantId ||
    !amount ||
    !latestTransactionStatus
  ) {
    throw errorWithStatus(
      "Payload DANA Finish Notify tidak lengkap",
      400
    );
  }

  if (
    merchantId !==
    danaPaymentConfig
      .merchantId
  ) {
    throw errorWithStatus(
      "Merchant ID DANA tidak sesuai",
      401
    );
  }

  const order =
    await orderModel
      .getOrderById(
        originalPartnerReferenceNo
      );

  if (!order) {
    throw errorWithStatus(
      "Order tidak ditemukan",
      404
    );
  }

  if (
    order.dana_payment_id &&
    order.dana_payment_id !==
      originalReferenceNo
  ) {
    throw errorWithStatus(
      "Reference DANA tidak sesuai",
      409
    );
  }

  if (
    amount.currency !==
    "IDR"
  ) {
    throw errorWithStatus(
      "Currency pembayaran DANA tidak sesuai",
      409
    );
  }

  const callbackAmount =
    Number(
      amount.value
    );

  const orderAmount =
    Number(
      order.total
    );

  if (
    !Number.isFinite(
      callbackAmount
    ) ||
    !Number.isFinite(
      orderAmount
    ) ||
    callbackAmount !==
      orderAmount
  ) {
    throw errorWithStatus(
      "Nominal pembayaran DANA tidak sesuai dengan order",
      409
    );
  }

  // ==========================================================
  // SUCCESS
  // ==========================================================

  if (
    latestTransactionStatus ===
    "00"
  ) {
    return orderModel
      .processPaymentCallback({
        id_order:
          originalPartnerReferenceNo,

        payment_status:
          "APPROVED",

        order_status:
          "APPROVED",

        dana_payment_id:
          originalReferenceNo,

        paid_at:
          finishedTime ||
          new Date(),

        payment_expired_at:
          order
            .payment_expired_at ||
          null,
      });
  }

  // ==========================================================
  // EXPIRED / CANCELLED
  // ==========================================================

  if (
    latestTransactionStatus ===
    "05"
  ) {
    return orderModel
      .processPaymentCallback({
        id_order:
          originalPartnerReferenceNo,

        payment_status:
          "EXPIRED",

        order_status:
          "CANCELLED",

        dana_payment_id:
          originalReferenceNo,

        paid_at:
          null,

        payment_expired_at:
          order
            .payment_expired_at ||
          null,
      });
  }

  throw errorWithStatus(
    `Status transaksi DANA belum didukung: ${latestTransactionStatus}`,
    400
  );
}