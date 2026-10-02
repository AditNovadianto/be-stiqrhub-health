import { createPrivateKey, createPublicKey } from "crypto";

function normalizePem(value) {
  if (!value) {
    return "";
  }

  return value.replace(/\\n/g, "\n");
}

export function validateDanaPaymentConfig() {
  const required = [
    "DANA_BASE_URL",
    "DANA_PARTNER_ID",
    "DANA_PRIVATE_KEY",

    "DANA_PAYMENT_NOTIFY_URL",
    "DANA_MERCHANT_ID",
    "DANA_CHANNEL_ID",

    "DANA_PRODUCT_CODE",
    "DANA_MCC",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing DANA payment configuration: ${missing.join(", ")}`,
    );
  }

  const channelId = process.env.DANA_CHANNEL_ID;

  if (channelId.length < 1 || channelId.length > 5) {
    throw new Error("DANA_CHANNEL_ID harus memiliki panjang 1-5 karakter");
  }

  const expiryMinutes = Number(process.env.DANA_PAYMENT_EXPIRY_MINUTES || 15);

  if (!Number.isFinite(expiryMinutes) || expiryMinutes <= 0) {
    throw new Error("DANA_PAYMENT_EXPIRY_MINUTES tidak valid");
  }
}

export const danaPaymentConfig = {
  baseUrl: process.env.DANA_BASE_URL,

  clientId: process.env.DANA_CLIENT_ID,

  partnerId: process.env.DANA_PARTNER_ID,

  merchantId: process.env.DANA_MERCHANT_ID,

  channelId: process.env.DANA_CHANNEL_ID,

  notifyUrl: process.env.DANA_PAYMENT_NOTIFY_URL,

  expiryMinutes: Number(process.env.DANA_PAYMENT_EXPIRY_MINUTES || 15),

  productCode: process.env.DANA_PRODUCT_CODE || "51051000100000000001",

  mcc: process.env.DANA_MCC,

  origin: process.env.DANA_ORIGIN || null,

  privateKey: process.env.DANA_PRIVATE_KEY
    ? createPrivateKey(normalizePem(process.env.DANA_PRIVATE_KEY))
    : null,

  publicKey: process.env.DANA_PUBLIC_KEY
    ? createPublicKey(normalizePem(process.env.DANA_PUBLIC_KEY))
    : null,
};
