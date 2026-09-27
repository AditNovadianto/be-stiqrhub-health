import crypto from "node:crypto";

import { getEncryptionKey } from "./tokenCrypto.js";

const DURATION_MS = 10 * 60 * 1000;

const AAD = Buffer.from("STIQR_DANA_ONBOARDING_V1");

const getOnboardingKey = () => {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      getEncryptionKey(),
      Buffer.from("stiqr-dana"),
      Buffer.from("onboarding-v1"),
      32,
    ),
  );
};

export const createDanaOnboardingToken = ({
  danaCustomerId,
  accessToken,
  refreshToken,
  accessTokenExpiresAt,
  refreshTokenExpiresAt,
}) => {
  if (!danaCustomerId || !accessToken) {
    throw new Error("Incomplete DANA onboarding data");
  }

  const now = Date.now();

  const payload = {
    type: "DANA_ONBOARDING",
    version: 1,
    danaCustomerId,
    accessToken,
    refreshToken: refreshToken ?? null,
    accessTokenExpiresAt: accessTokenExpiresAt ?? null,
    refreshTokenExpiresAt: refreshTokenExpiresAt ?? null,
    issuedAt: now,
    expiresAt: now + DURATION_MS,
  };

  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", getOnboardingKey(), iv);

  cipher.setAAD(AAD);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);

  const onboardingToken = [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");

  return {
    onboardingToken,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
};

export const verifyDanaOnboardingToken = (token) => {
  const invalid = () => {
    const error = new Error("Invalid or expired onboarding token");

    error.statusCode = 401;
    return error;
  };

  if (typeof token !== "string" || token.length > 8192) {
    throw invalid();
  }

  const parts = token.split(".");

  if (parts.length !== 4 || parts[0] !== "v1") {
    throw invalid();
  }

  try {
    const [, ivPart, tagPart, dataPart] = parts;

    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const data = Buffer.from(dataPart, "base64url");

    if (iv.length !== 12 || tag.length !== 16) {
      throw invalid();
    }

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getOnboardingKey(),
      iv,
    );

    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);

    const payload = JSON.parse(decrypted.toString("utf8"));

    const now = Date.now();

    if (
      payload.type !== "DANA_ONBOARDING" ||
      payload.version !== 1 ||
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.issuedAt > now + 60000 ||
      payload.expiresAt <= now ||
      payload.expiresAt - payload.issuedAt > DURATION_MS ||
      typeof payload.danaCustomerId !== "string" ||
      !payload.danaCustomerId ||
      typeof payload.accessToken !== "string" ||
      !payload.accessToken
    ) {
      throw invalid();
    }

    return payload;
  } catch {
    throw invalid();
  }
};
