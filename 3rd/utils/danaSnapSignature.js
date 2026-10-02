import crypto from "crypto";

export function getJakartaTimestamp() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",

    year: "numeric",

    month: "2-digit",

    day: "2-digit",

    hour: "2-digit",

    minute: "2-digit",

    second: "2-digit",

    hour12: false,
  });

  const parts = formatter.formatToParts(now);

  const value = {};

  for (const part of parts) {
    value[part.type] = part.value;
  }

  return (
    `${value.year}-${value.month}-${value.day}` +
    `T${value.hour}:${value.minute}:${value.second}+07:00`
  );
}

export function createExternalId() {
  const timestamp = Date.now().toString();

  const random = Math.floor(Math.random() * 1000000000).toString();

  return (timestamp + random).slice(0, 36);
}

function hashBody(rawBody) {
  return crypto
    .createHash("sha256")
    .update(rawBody || "", "utf8")
    .digest("hex")
    .toLowerCase();
}

export function generateSnapSignature({
  method,
  path,
  rawBody,
  timestamp,
  privateKey,
}) {
  const bodyHash = hashBody(rawBody);

  const stringToSign =
    `${method.toUpperCase()}:` + `${path}:` + `${bodyHash}:` + `${timestamp}`;

  const signer = crypto.createSign("RSA-SHA256");

  signer.update(stringToSign);

  signer.end();

  return signer.sign(privateKey, "base64");
}

export function verifySnapSignature({
  method,
  path,
  rawBody,
  timestamp,
  signature,
  publicKey,
}) {
  if (!signature || !timestamp || !publicKey) {
    return false;
  }

  const bodyHash = hashBody(rawBody);

  const stringToSign =
    `${method.toUpperCase()}:` + `${path}:` + `${bodyHash}:` + `${timestamp}`;

  try {
    return crypto.verify(
      "RSA-SHA256",

      Buffer.from(stringToSign, "utf8"),

      publicKey,

      Buffer.from(signature, "base64"),
    );
  } catch (error) {
    return false;
  }
}
