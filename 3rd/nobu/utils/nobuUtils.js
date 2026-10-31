import crypto from "node:crypto";

// ============================================
// ORDER REFERENCE
// ============================================

export const createNobuOrderId = () => {
  const timestamp = Date.now();
  const random = crypto.randomInt(1000, 10000);

  return `E2E-MID-${timestamp}${random}`;
};

export const isValidNobuReference = (value) => {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
};

// ============================================
// ERROR HELPER
// ============================================

export const nobuError = (message, status = 400, data = null) => {
  const error = new Error(message);
  error.status = status;
  error.data = data;
  return error;
};

// ============================================
// AMOUNT
// ============================================

export const parseNobuPrice = (value) => {
  const raw = String(value ?? "").trim();

  if (!/^\d+(?:\.0{1,2})?$/.test(raw)) {
    throw nobuError("Format harga layanan tidak valid");
  }

  const amount = Number(raw);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw nobuError("Nominal layanan tidak valid");
  }

  return amount;
};

export const formatNobuAmount = (amount) => {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Invalid NOBU amount");
  }

  return amount.toFixed(2);
};

// ============================================
// DATE
// ============================================

export const toJakartaDatetime = (input) => {
  const date = new Date(input);

  if (Number.isNaN(date.getTime())) {
    throw nobuError("Tanggal tidak valid");
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;

  return (
    `${get("year")}-${get("month")}-${get("day")} ` +
    `${get("hour")}:${get("minute")}:${get("second")}`
  );
};

export const validateNobuBookingAt = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    throw nobuError("booking_at harus ISO-8601 dengan timezone");
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw nobuError("Tanggal booking harus di masa depan");
  }

  return toJakartaDatetime(value);
};

// ============================================
// CENTRALIZED LOGGER
// ============================================

const PREFIX = "[NOBU QRIS]";

const formatDetail = (details = {}) => {
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  );
};

const writeLog = (level, stage, message, details = {}) => {
  const entry = {
    time: new Date().toISOString(),
    level,
    stage,
    message,
    ...formatDetail(details),
  };

  const output = `${PREFIX} ${JSON.stringify(entry)}`;

  if (level === "ERROR") {
    console.error(output);
  } else if (level === "WARN") {
    console.warn(output);
  } else {
    console.log(output);
  }
};

export const nobuLog = {
  info(stage, message, details = {}) {
    writeLog("INFO", stage, message, details);
  },

  warn(stage, message, details = {}) {
    writeLog("WARN", stage, message, details);
  },

  error(stage, message, error, details = {}) {
    writeLog("ERROR", stage, message, {
      ...details,
      errorName: error?.name ?? null,
      errorMessage: error?.message ?? null,
      errorStage: error?.stage ?? null,
      httpStatus: error?.httpStatus ?? null,
      responseCode: error?.responseCode ?? null,
      responseMessage: error?.responseMessage ?? null,
      causeCode: error?.causeCode ?? error?.cause?.code ?? null,
    });
  },
};
