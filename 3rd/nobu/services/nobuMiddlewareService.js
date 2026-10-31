import { getNobuConfig } from "../config/nobu.js";

import {
  formatNobuAmount,
  isValidNobuReference,
  nobuLog,
} from "../utils/nobuUtils.js";

const GENERATE_PATH = "/nobu/generate-qris-simple";

const STATUS_PATH = "/nobu/check-status";

export class NobuMiddlewareError extends Error {
  constructor(message, details = {}) {
    super(message);

    this.name = "NobuMiddlewareError";

    this.stage = details.stage ?? null;
    this.httpStatus = details.httpStatus ?? null;
    this.responseCode = details.responseCode ?? null;
    this.responseMessage = details.responseMessage ?? null;
    this.causeCode = details.causeCode ?? null;
  }
}

// ============================================
// MIDDLEWARE HTTP CLIENT
// ============================================

const middlewareRequest = async ({ method, path, reference, body }) => {
  const config = getNobuConfig();

  const url = `${config.baseUrl}${path}`;
  const startedAt = Date.now();

  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  nobuLog.info("REQUEST", "Request sent to middleware", {
    method,
    path,
    reference,
    amount: body?.amount,
  });

  try {
    let response;

    // ========================================
    // SEND REQUEST
    // ========================================

    try {
      response = await fetch(url, {
        method,
        headers: {
          "X-API-Key": config.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      throw new NobuMiddlewareError("Failed to contact middleware", {
        stage: "FETCH",
        causeCode: error.cause?.code ?? error.name ?? null,
      });
    }

    // ========================================
    // READ RESPONSE
    // ========================================

    let rawBody;

    try {
      rawBody = await response.text();
    } catch (error) {
      throw new NobuMiddlewareError("Failed to read middleware response", {
        stage: "BODY_READ",
        httpStatus: response.status,
        causeCode: error.cause?.code ?? error.name ?? null,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("json")) {
      const htmlTitle = rawBody
        .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        ?.replace(/\s+/g, " ")
        ?.trim();

      throw new NobuMiddlewareError("Middleware returned non-JSON response", {
        stage: "NON_JSON",
        httpStatus: response.status,
        responseMessage:
          htmlTitle?.slice(0, 100) ?? `Content-Type: ${contentType}`,
      });
    }

    let result;

    try {
      result = JSON.parse(rawBody);
    } catch {
      throw new NobuMiddlewareError("Invalid middleware JSON response", {
        stage: "JSON_PARSE",
        httpStatus: response.status,
      });
    }

    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new NobuMiddlewareError("Invalid middleware response structure", {
        stage: "RESPONSE_STRUCTURE",
        httpStatus: response.status,
      });
    }

    const durationMs = Date.now() - startedAt;

    // Satu log respons untuk semua request normal.
    nobuLog.info("RESPONSE", "Middleware responded", {
      method,
      path,
      reference,
      httpStatus: response.status,
      responseCode: result.responseCode ?? null,
      durationMs,
    });

    if (!response.ok) {
      throw new NobuMiddlewareError("Middleware rejected request", {
        stage: "HTTP_ERROR",
        httpStatus: response.status,
        responseCode: result.responseCode ?? null,
        responseMessage: result.responseMessage ?? result.message ?? null,
      });
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
};

// ============================================
// GENERATE QRIS
// ============================================

export const generateNobuQris = async ({ orderId, amount }) => {
  if (!isValidNobuReference(orderId)) {
    throw new Error("Invalid partnerReferenceNo");
  }

  const config = getNobuConfig();

  // Payload tetap sama seperti pengujian sukses.
  const payload = {
    partnerReferenceNo: orderId,
    amount: formatNobuAmount(amount),
    merchantId: config.merchantId,
    subMerchantId: config.subMerchantId,
    storeId: config.storeId,
    terminalId: config.terminalId,
  };

  const result = await middlewareRequest({
    method: "POST",
    path: GENERATE_PATH,
    reference: orderId,
    body: payload,
  });

  const validations = {
    responseCode: String(result.responseCode ?? "") === "2004700",

    reference: result.partnerReferenceNo === orderId,

    merchant: result.merchantId === config.merchantId,

    store: result.storeId === config.storeId,

    subMerchant: result.subMerchantId === config.subMerchantId,

    terminal: result.terminalId === config.terminalId,

    qrContent:
      typeof result.qrContent === "string" &&
      result.qrContent.trim().length > 0,
  };

  const invalidFields = Object.entries(validations)
    .filter(([, valid]) => !valid)
    .map(([key]) => key);

  if (invalidFields.length) {
    throw new NobuMiddlewareError(
      `QRIS response validation failed: ${invalidFields.join(", ")}`,
      {
        stage: "GENERATE_VALIDATION",
        responseCode: result.responseCode ?? null,
        responseMessage: result.responseMessage ?? null,
      },
    );
  }

  nobuLog.info("GENERATE", "QRIS created successfully", {
    reference: orderId,
    responseCode: result.responseCode,
    qrAvailable: true,
  });

  return {
    partnerReferenceNo: result.partnerReferenceNo,
    qrContent: result.qrContent,
    qrUrl: result.qrUrl || null,
    merchantName: result.merchantName || null,
  };
};

// ============================================
// CHECK STATUS
// ============================================

export const checkNobuQrisStatus = async ({ orderId }) => {
  if (!isValidNobuReference(orderId)) {
    throw new NobuMiddlewareError("Invalid partnerReferenceNo", {
      stage: "STATUS_INPUT",
    });
  }

  const result = await middlewareRequest({
    method: "GET",
    path: `${STATUS_PATH}/${encodeURIComponent(orderId)}`,
    reference: orderId,
  });

  if (
    result.success !== true ||
    !result.data ||
    typeof result.data !== "object" ||
    Array.isArray(result.data)
  ) {
    throw new NobuMiddlewareError("Invalid Check Status response", {
      stage: "STATUS_STRUCTURE",
    });
  }

  const data = result.data;

  const reference = data.partner_reference_no ?? data.partnerReferenceNo;

  if (reference !== orderId) {
    throw new NobuMiddlewareError("Check Status reference mismatch", {
      stage: "STATUS_REFERENCE",
    });
  }

  let inquiry = null;

  if (data.last_query_response) {
    try {
      inquiry =
        typeof data.last_query_response === "string"
          ? JSON.parse(data.last_query_response)
          : data.last_query_response;
    } catch {
      throw new NobuMiddlewareError("Invalid last_query_response", {
        stage: "INQUIRY_PARSE",
      });
    }
  }

  const middlewareStatus = String(data.status ?? "unknown").toLowerCase();

  const inquiryStatus =
    inquiry?.latestTransactionStatus != null
      ? String(inquiry.latestTransactionStatus)
      : null;

  const inquiryResponseCode =
    inquiry?.responseCode != null ? String(inquiry.responseCode) : null;

  const inquiryReference = inquiry?.originalPartnerReferenceNo ?? null;

  const inquiryVerified =
    inquiryResponseCode === "2005100" && inquiryReference === orderId;

  const generatedEvidence = inquiryVerified && inquiryStatus === "01";

  const paidEvidence =
    inquiryVerified && inquiryStatus === "00" && middlewareStatus === "paid";

  nobuLog.info("STATUS", "Middleware payment status checked", {
    reference: orderId,
    middlewareStatus,
    inquiryStatus,
    inquiryResponseCode,
    inquiryReferenceMatches: inquiryReference === orderId,
    hasInquiry: Boolean(inquiry),
    paidEvidence,
    checkCount: data.check_count ?? null,
  });

  return {
    partnerReferenceNo: reference,

    middlewareStatus,
    inquiryStatus,
    inquiryResponseCode,
    inquiryReference,

    hasInquiryEvidence: Boolean(inquiry),
    generatedEvidence,
    paidEvidence,

    // Dipakai untuk validasi finansial.
    amount: inquiry?.amount ?? null,

    // Informasi tambahan jika NOBU
    // menyediakannya dalam hasil inquiry.
    merchantId:
      inquiry?.additionalInfo?.merchantId ?? inquiry?.merchantId ?? null,

    storeId:
      inquiry?.externalStoreId ?? inquiry?.additionalInfo?.storeId ?? null,

    paidAt: inquiry?.additionalInfo?.paymentDate ?? inquiry?.paidTime ?? null,

    checkCount: data.check_count ?? null,
    lastCheckedAt: data.last_checked_at ?? null,
    isCallbackReceived: data.is_callback_received ?? null,
  };
};
