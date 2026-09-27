import { db } from "../../config/db.js";

import { createCustomerJwt } from "../adapters/customerJwt.js";

import {
  loginWithDana,
  completeDanaProfile,
  linkDanaAccount,
  linkDanaWithOnboarding,
  getDanaAuthStatus,
} from "../services/danaAuthService.js";

const sendError = (res, error) => {
  const allowed = [400, 401, 404, 409, 422, 502, 504];

  const statusCode = allowed.includes(error.statusCode)
    ? error.statusCode
    : 500;

  console.error("[DANA AUTH ERROR]", {
    statusCode,
    message: error.message,
    danaResponseCode: error.danaResponseCode ?? null,
  });

  const messages = {
    400: "Invalid request",
    401: "Authentication is required or expired",
    404: "Customer not found",
    409: error.message,
    422: error.message,
    502: "DANA authentication failed",
    504: "DANA request timed out",
  };

  return res.status(statusCode).json({
    success: false,

    message: messages[statusCode] || "Internal server error",

    ...(error.danaResponseCode && {
      danaResponseCode: error.danaResponseCode,
    }),
  });
};

// =====================================
// LOGIN DANA
// =====================================

export const danaLogin = async (req, res) => {
  try {
    const { authCode } = req.body ?? {};

    if (
      typeof authCode !== "string" ||
      !authCode.trim() ||
      authCode.length > 256
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid authCode is required",
      });
    }

    const result = await loginWithDana(authCode.trim());

    if (result.status === "PROFILE_REQUIRED") {
      return res.status(200).json({
        success: true,

        message: "Customer registration or linking required",

        data: result,
      });
    }

    const token = createCustomerJwt(result.idCustomer);

    return res.status(200).json({
      success: true,
      message: "DANA login successful",

      data: {
        status: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: token,
        customer: result.customer,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// =====================================
// COMPLETE PROFILE
// DENGAN PASSWORD
// =====================================

export const danaCompleteProfile = async (req, res) => {
  try {
    const {
      onboardingToken,
      name,
      email,
      phoneNumber,
      dob,
      gender,
      password,
      confirmPassword,
    } = req.body ?? {};

    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    const normalizedPhone =
      typeof phoneNumber === "string" ? phoneNumber.replace(/[\s-]/g, "") : "";

    const dobDate =
      typeof dob === "string"
        ? new Date(`${dob}T00:00:00.000Z`)
        : new Date(NaN);

    const validDob =
      typeof dob === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(dob) &&
      !Number.isNaN(dobDate.getTime()) &&
      dobDate.toISOString().slice(0, 10) === dob &&
      dobDate.getTime() <= Date.now();

    // Minimal 12 karakter.
    // Bcrypt mempunyai batas input 72 byte.
    const validPassword =
      typeof password === "string" &&
      password.length >= 12 &&
      Buffer.byteLength(password, "utf8") <= 72;

    if (
      typeof onboardingToken !== "string" ||
      !onboardingToken ||
      onboardingToken.length > 8192 ||
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      normalizedEmail.length > 255 ||
      !/^\+?[0-9]{9,15}$/.test(normalizedPhone) ||
      !validDob ||
      !["Laki-laki", "Perempuan"].includes(gender)
    ) {
      return res.status(422).json({
        success: false,
        message: "Invalid profile information",
      });
    }

    if (!validPassword) {
      return res.status(422).json({
        success: false,
        message:
          "Password must contain at least 12 characters and no more than 72 UTF-8 bytes",
      });
    }

    if (typeof confirmPassword !== "string" || password !== confirmPassword) {
      return res.status(422).json({
        success: false,
        message: "Password confirmation does not match",
      });
    }

    const result = await completeDanaProfile({
      onboardingToken,

      name: name.trim(),

      email: normalizedEmail,

      phoneNumber: normalizedPhone,

      dob,

      gender,

      password,
    });

    const token = createCustomerJwt(result.idCustomer);

    return res.status(201).json({
      success: true,

      message: "Customer registration successful",

      data: {
        status: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: token,
        customer: result.customer,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// =====================================
// GET CUSTOMER
// =====================================

export const danaMe = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         id_customer,
         name_customer,
         email_customer,
         phone_number_customer,
         dob_customer,
         gender_customer
       FROM customers
       WHERE id_customer = ?
       LIMIT 1`,
      [req.user.id_customer],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// =====================================
// LINK MENGGUNAKAN AUTH CODE
// =====================================

export const authenticateDana = async (req, res) => {
  try {
    const { authCode } = req.body ?? {};

    if (
      typeof authCode !== "string" ||
      !authCode.trim() ||
      authCode.length > 256
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid authCode is required",
      });
    }

    const result = await linkDanaAccount({
      authCode: authCode.trim(),
      idCustomer: req.user.id_customer,
    });

    return res.status(200).json({
      success: true,
      message: "DANA account linked successfully",
      data: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// =====================================
// LINK MENGGUNAKAN ONBOARDING TOKEN
// =====================================

export const danaLinkOnboarding = async (req, res) => {
  try {
    const { onboardingToken } = req.body ?? {};

    if (
      typeof onboardingToken !== "string" ||
      !onboardingToken.trim() ||
      onboardingToken.length > 8192
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid onboardingToken is required",
      });
    }

    const result = await linkDanaWithOnboarding({
      onboardingToken: onboardingToken.trim(),

      idCustomer: req.user.id_customer,
    });

    const token = createCustomerJwt(result.idCustomer);

    return res.status(200).json({
      success: true,

      message: "Existing customer successfully linked to DANA",

      data: {
        status: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: token,
        linked: true,
        customer: result.customer,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

// =====================================
// GET AUTH STATUS
// =====================================

export const getAuthStatus = async (req, res) => {
  try {
    const result = await getDanaAuthStatus(req.user.id_customer);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
};
