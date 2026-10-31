import { sign } from "node:crypto";
import { danaConfig } from "../config/dana.js";

export const getDanaTimestamp = () => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map(({ type, value }) => [type, value]),
  );

  return (
    `${parts.year}-${parts.month}-${parts.day}` +
    `T${parts.hour}:${parts.minute}:${parts.second}+07:00`
  );
};

export const generateDanaSignature = (timestamp) => {
  const stringToSign = `${danaConfig.clientId}|${timestamp}`;

  try {
    return sign(
      "RSA-SHA256",
      Buffer.from(stringToSign, "utf8"),
      danaConfig.privateKey,
    ).toString("base64");
  } catch {
    const error = new Error("Failed to generate DANA RSA signature");

    error.statusCode = 500;
    throw error;
  }
};
