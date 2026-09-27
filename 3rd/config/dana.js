import "dotenv/config";
import { createPrivateKey } from "node:crypto";

const loadPrivateKey = () => {
  const raw = process.env.DANA_PRIVATE_KEY;

  if (!raw) {
    throw new Error("DANA_PRIVATE_KEY is not configured");
  }

  try {
    const pem = raw.replace(/\\n/g, "\n").trim();
    const key = createPrivateKey(pem);

    if (key.asymmetricKeyType !== "rsa") {
      throw new Error("DANA private key must be RSA");
    }

    return key;
  } catch {
    throw new Error("Invalid DANA_PRIVATE_KEY PEM format");
  }
};

export const danaConfig = {
  baseUrl: process.env.DANA_BASE_URL?.replace(/\/+$/, ""),
  clientId: process.env.DANA_CLIENT_ID,
  partnerId: process.env.DANA_PARTNER_ID || process.env.DANA_CLIENT_ID,
  privateKey: loadPrivateKey(),
  timeout: 8000,
};

export const validateDanaConfig = () => {
  if (!danaConfig.baseUrl) {
    throw new Error("DANA_BASE_URL is not configured");
  }

  if (!danaConfig.clientId) {
    throw new Error("DANA_CLIENT_ID is not configured");
  }

  if (!danaConfig.partnerId) {
    throw new Error("DANA_PARTNER_ID is not configured");
  }

  if (!danaConfig.baseUrl.startsWith("https://")) {
    throw new Error("DANA_BASE_URL must use HTTPS");
  }
};
