import crypto from "node:crypto";

export const getEncryptionKey = () => {
  const hex = process.env.DANA_TOKEN_ENCRYPTION_KEY || "";

  if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
    throw new Error(
      "DANA_TOKEN_ENCRYPTION_KEY must contain 64 hexadecimal characters",
    );
  }

  return Buffer.from(hex, "hex");
};

export const encryptToken = (value) => {
  if (!value) return null;

  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
};

export const decryptToken = (value) => {
  if (!value) return null;

  const parts = value.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const [ivHex, tagHex, dataHex] = parts;

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Invalid encrypted token format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    iv,
  );

  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
};
