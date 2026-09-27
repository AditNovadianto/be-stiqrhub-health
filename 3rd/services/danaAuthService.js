import bcrypt from "bcryptjs";

import { db } from "../../config/db.js";

import { danaConfig, validateDanaConfig } from "../config/dana.js";

import {
  getDanaTimestamp,
  generateDanaSignature,
} from "../utils/danaSignature.js";

import {
  createDanaOnboardingToken,
  verifyDanaOnboardingToken,
} from "../utils/danaOnboardingToken.js";

import { CustomerAuthModel } from "../models/customerAuthModel.js";

const APPLY_TOKEN_PATH = "/v1.0/access-token/b2b2c.htm";

const createError = (message, statusCode = 502, danaResponseCode = null) => {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.danaResponseCode = danaResponseCode;

  return error;
};

const withTransaction = async (callback) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const result = await callback(conn);

    await conn.commit();

    return result;
  } catch (error) {
    await conn.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createError("Account registration or linking conflict", 409);
    }

    throw error;
  } finally {
    conn.release();
  }
};

// ======================================
// 1. APPLY TOKEN
// ======================================

export const requestApplyToken = async (authCode) => {
  if (
    typeof authCode !== "string" ||
    !authCode.trim() ||
    authCode.length > 256
  ) {
    throw createError("Invalid DANA authCode", 400);
  }

  validateDanaConfig();

  const timestamp = getDanaTimestamp();

  const signature = generateDanaSignature(timestamp);

  const url = `${danaConfig.baseUrl}${APPLY_TOKEN_PATH}`;

  let response;
  let result;

  try {
    response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "X-TIMESTAMP": timestamp,
        "X-CLIENT-KEY": danaConfig.clientId,
        "X-PARTNER-ID": danaConfig.partnerId,
        "X-SIGNATURE": signature,
      },

      body: JSON.stringify({
        grantType: "AUTHORIZATION_CODE",
        authCode: authCode.trim(),
        refreshToken: "",
        additionalInfo: {},
      }),

      signal: AbortSignal.timeout(danaConfig.timeout),

      redirect: "error",
    });

    const responseText = await response.text();

    try {
      result = JSON.parse(responseText);
    } catch {
      throw createError("Invalid JSON response from DANA", 502);
    }
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    const causeCode = error.cause?.code;

    const isTimeout =
      error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      causeCode === "ETIMEDOUT" ||
      causeCode === "UND_ERR_CONNECT_TIMEOUT";

    console.error("[DANA FETCH ERROR]", {
      name: error.name,
      causeCode: causeCode ?? null,
    });

    throw createError(
      isTimeout ? "DANA request timed out" : "Unable to connect to DANA",
      isTimeout ? 504 : 502,
    );
  }

  if (!response.ok || result?.responseCode !== "2007400") {
    throw createError(
      "DANA Apply Token failed",
      502,
      result?.responseCode ?? null,
    );
  }

  if (typeof result.accessToken !== "string" || !result.accessToken) {
    throw createError("DANA access token is missing", 502);
  }

  const publicUserId = result.additionalInfo?.userInfo?.publicUserId;

  if (typeof publicUserId !== "string" || !publicUserId.trim()) {
    throw createError("DANA publicUserId is unavailable", 502);
  }

  return {
    danaCustomerId: publicUserId.trim(),

    accessToken: result.accessToken,

    refreshToken: result.refreshToken ?? null,

    accessTokenExpiresAt: result.accessTokenExpiryTime ?? null,

    refreshTokenExpiresAt: result.refreshTokenExpiryTime ?? null,
  };
};

// ======================================
// 2. LOGIN VIA DANA
// ======================================

export const loginWithDana = async (authCode) => {
  const danaAuth = await requestApplyToken(authCode);

  const existing = await CustomerAuthModel.findByDanaCustomerId(
    danaAuth.danaCustomerId,
  );

  // Customer yang sudah terhubung.
  if (existing) {
    await withTransaction(async (conn) => {
      await CustomerAuthModel.saveDanaToken(
        {
          idCustomer: existing.id_customer,
          ...danaAuth,
        },
        conn,
      );
    });

    return {
      status: "AUTHENTICATED",

      idCustomer: Number(existing.id_customer),

      customer: {
        id_customer: Number(existing.id_customer),

        name_customer: existing.name_customer,

        email_customer: existing.email_customer,
      },
    };
  }

  // Belum ada hubungan dengan DANA.
  // Bisa customer baru atau customer website
  // yang belum pernah menghubungkan DANA.
  const onboarding = createDanaOnboardingToken(danaAuth);

  return {
    status: "PROFILE_REQUIRED",
    ...onboarding,
  };
};

// ======================================
// 3. COMPLETE PROFILE
// SEKARANG WAJIB MEMBUAT PASSWORD
// ======================================

export const completeDanaProfile = async ({
  onboardingToken,
  name,
  email,
  phoneNumber,
  dob,
  gender,
  password,
}) => {
  // Validasi tambahan di service agar
  // tidak hanya bergantung pada controller.
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw createError(
      "Password must contain at least 12 characters and no more than 72 UTF-8 bytes",
      422,
    );
  }

  // Pastikan onboarding token berasal
  // dari backend dan belum kedaluwarsa.
  const onboarding = verifyDanaOnboardingToken(onboardingToken);

  // Hash dilakukan di backend.
  // Jangan menyimpan plaintext password.
  const hashedPassword = await bcrypt.hash(password, 12);

  return withTransaction(async (conn) => {
    // Pastikan publicUserId belum dipakai.
    const existingDana = await CustomerAuthModel.findByDanaCustomerId(
      onboarding.danaCustomerId,
      conn,
    );

    if (existingDana) {
      throw createError("DANA account is already registered", 409);
    }

    // Periksa apakah email sudah digunakan
    // oleh customer website existing.
    const [existingEmail] = await conn.execute(
      `SELECT id_customer
       FROM customers
       WHERE LOWER(email_customer) = LOWER(?)
       LIMIT 1`,
      [email],
    );

    if (existingEmail.length > 0) {
      throw createError(
        "Email is already registered. Sign in to your existing STIQR Hub account and link DANA.",
        409,
      );
    }

    // 1. Buat customer dengan password
    // yang sudah di-hash.
    const [customerResult] = await conn.execute(
      `INSERT INTO customers (
         name_customer,
         email_customer,
         password_customer,
         phone_number_customer,
         dob_customer,
         gender_customer,
         id_platform
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, email, hashedPassword, phoneNumber, dob, gender, 1],
    );

    const idCustomer = customerResult.insertId;

    // 2. Hubungkan customer dengan DANA.
    // Kedua INSERT ada dalam transaksi sama.
    await CustomerAuthModel.saveDanaToken(
      {
        idCustomer,

        danaCustomerId: onboarding.danaCustomerId,

        accessToken: onboarding.accessToken,

        refreshToken: onboarding.refreshToken,

        accessTokenExpiresAt: onboarding.accessTokenExpiresAt,

        refreshTokenExpiresAt: onboarding.refreshTokenExpiresAt,
      },
      conn,
    );

    return {
      idCustomer: Number(idCustomer),

      customer: {
        id_customer: Number(idCustomer),
        name_customer: name,
        email_customer: email,
      },
    };
  });
};

// ======================================
// 4. LINK CUSTOMER EXISTING
// DENGAN AUTH CODE BARU
// ======================================

export const linkDanaAccount = async ({ authCode, idCustomer }) => {
  const danaAuth = await requestApplyToken(authCode);

  return withTransaction(async (conn) => {
    return CustomerAuthModel.saveDanaToken(
      {
        idCustomer,
        ...danaAuth,
      },
      conn,
    );
  });
};

// ======================================
// 5. LINK CUSTOMER EXISTING
// DENGAN ONBOARDING TOKEN
// ======================================

export const linkDanaWithOnboarding = async ({
  onboardingToken,
  idCustomer,
}) => {
  if (!Number.isSafeInteger(Number(idCustomer)) || Number(idCustomer) <= 0) {
    throw createError("Invalid customer identity", 401);
  }

  const onboarding = verifyDanaOnboardingToken(onboardingToken);

  return withTransaction(async (conn) => {
    // id_customer berasal dari JWT website
    // yang telah diverifikasi middleware.
    const [customerRows] = await conn.execute(
      `SELECT
         id_customer,
         name_customer,
         email_customer
       FROM customers
       WHERE id_customer = ?
       FOR UPDATE`,
      [Number(idCustomer)],
    );

    if (!customerRows.length) {
      throw createError("Customer not found", 404);
    }

    const customer = customerRows[0];

    // CustomerAuthModel akan memeriksa
    // apakah DANA sudah digunakan customer lain
    // atau customer sudah terhubung ke akun
    // DANA berbeda.
    await CustomerAuthModel.saveDanaToken(
      {
        idCustomer: Number(idCustomer),

        danaCustomerId: onboarding.danaCustomerId,

        accessToken: onboarding.accessToken,

        refreshToken: onboarding.refreshToken,

        accessTokenExpiresAt: onboarding.accessTokenExpiresAt,

        refreshTokenExpiresAt: onboarding.refreshTokenExpiresAt,
      },
      conn,
    );

    return {
      status: "AUTHENTICATED",

      linked: true,

      idCustomer: Number(idCustomer),

      customer: {
        id_customer: Number(customer.id_customer),

        name_customer: customer.name_customer,

        email_customer: customer.email_customer,
      },
    };
  });
};

// ======================================
// 6. GET STATUS
// ======================================

export const getDanaAuthStatus = async (idCustomer) => {
  return CustomerAuthModel.getStatus(idCustomer);
};
