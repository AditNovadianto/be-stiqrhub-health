import { db } from "../config/db.js";
import jwt from "jsonwebtoken";
import {
  randomInt,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { sendOtpEmail } from "../utils/mailer.js";

// CONSTANTS
const OTP_TTL_SECONDS = 300;
const OTP_ISSUER = "stiQR-customer";
const OTP_AUDIENCE = "customer-otp";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_RE = /^\d{6}$/;
const ID_RE = /^[1-9]\d*$/;

// HELPERS
const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

function getOtpSecret() {
  const secret = process.env.CUSTOMER_OTP_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("CUSTOMER_OTP_SECRET harus minimal 32 byte");
  }

  return secret;
}

function signToken(customer) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }

  return jwt.sign(
    {
      id_customer: customer.id_customer,
      name_customer: customer.name_customer,
      email_customer: customer.email_customer,
      actor_type: "CUSTOMER",
    },
    process.env.JWT_SECRET,
    {
      subject: String(customer.id_customer),
      expiresIn: "24h",
      issuer: "my-app",
      audience: "my-app-users",
      algorithm: "HS256",
    },
  );
}

const sanitizeCustomer = (customer) => ({
  id_customer: customer.id_customer,
  name_customer: customer.name_customer,
  email_customer: customer.email_customer,
  phone_number_customer: customer.phone_number_customer,
  dob_customer: customer.dob_customer,
  gender_customer: customer.gender_customer,
  id_platform: customer.id_platform,
  status_customer: customer.status_customer,
});

async function findCustomerByEmail(email) {
  const [rows] = await db.query(
    `SELECT
      id_customer,
      name_customer,
      email_customer,
      phone_number_customer,
      dob_customer,
      gender_customer,
      id_platform,
      status_customer
    FROM customers
    WHERE email_customer = ?
    LIMIT 1`,
    [email],
  );

  return rows[0] ?? null;
}

async function findCustomerById(id) {
  const [rows] = await db.query(
    `SELECT
      id_customer,
      name_customer,
      email_customer,
      phone_number_customer,
      dob_customer,
      gender_customer,
      id_platform,
      status_customer
    FROM customers
    WHERE id_customer = ?
    LIMIT 1`,
    [id],
  );

  return rows[0] ?? null;
}

// OTP HELPERS
function generateOtp() {
  return randomInt(0, 1000000).toString().padStart(6, "0");
}

function hashOtp(id, email, otp, jti, purpose) {
  return createHmac("sha256", getOtpSecret())
    .update(`${purpose}:${id}:${email}:${jti}:${otp}`)
    .digest("hex");
}

function createOtpChallenge(customer, purpose) {
  const otp = generateOtp();
  const jti = randomUUID();

  const email = normalizeEmail(customer.email_customer);

  const otpHash = hashOtp(customer.id_customer, email, otp, jti, purpose);

  const otp_token = jwt.sign(
    {
      purpose,
      email_customer: email,
      otp_hash: otpHash,
    },
    getOtpSecret(),
    {
      algorithm: "HS256",
      subject: String(customer.id_customer),
      issuer: OTP_ISSUER,
      audience: OTP_AUDIENCE,
      jwtid: jti,
      expiresIn: OTP_TTL_SECONDS,
    },
  );

  return {
    otp,
    otp_token,
    expires_in_seconds: OTP_TTL_SECONDS,
  };
}

function verifyOtpChallenge(customer, otp, otpToken, purpose) {
  if (typeof otp !== "string" || !OTP_RE.test(otp)) {
    return false;
  }

  if (typeof otpToken !== "string" || !otpToken.trim()) {
    return false;
  }

  let payload;

  try {
    payload = jwt.verify(otpToken, getOtpSecret(), {
      algorithms: ["HS256"],
      issuer: OTP_ISSUER,
      audience: OTP_AUDIENCE,
      subject: String(customer.id_customer),
    });
  } catch (error) {
    if (
      ["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(
        error.name,
      )
    ) {
      return false;
    }

    throw error;
  }

  if (
    !payload ||
    payload.purpose !== purpose ||
    payload.email_customer !== normalizeEmail(customer.email_customer) ||
    typeof payload.jti !== "string" ||
    typeof payload.otp_hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(payload.otp_hash)
  ) {
    return false;
  }

  const actual = Buffer.from(
    hashOtp(
      customer.id_customer,
      normalizeEmail(customer.email_customer),
      otp,
      payload.jti,
      purpose,
    ),
    "hex",
  );

  const expected = Buffer.from(payload.otp_hash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function serverError(res, context, error) {
  console.error(`${context} error:`, error);

  return res.status(500).json({
    success: false,
    error: "Internal server error",
  });
}

// SIGN UP CUSTOMER
export const signUpCustomer = async (req, res) => {
  const {
    name_customer,
    email_customer,
    phone_number_customer,
    dob_customer,
    gender_customer,
    id_platform,
  } = req.body;

  const email = normalizeEmail(email_customer);

  if (
    typeof name_customer !== "string" ||
    !name_customer.trim() ||
    !EMAIL_RE.test(email) ||
    !phone_number_customer ||
    !dob_customer ||
    !gender_customer ||
    !ID_RE.test(String(id_platform ?? ""))
  ) {
    return res.status(400).json({
      success: false,
      error: "Data registrasi tidak lengkap atau tidak valid",
    });
  }

  try {
    // 1. Cek email customer
    const existing = await findCustomerByEmail(email);

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Customer already exists",
      });
    }

    // 2. Simpan customer
    const [result] = await db.query(
      `INSERT INTO customers (
        name_customer,
        email_customer,
        phone_number_customer,
        dob_customer,
        gender_customer,
        id_platform,
        status_customer
      )
      VALUES (?, ?, ?, ?, ?, ?, 'NOT_ACTIVE')`,
      [
        name_customer.trim(),
        email,
        phone_number_customer,
        dob_customer,
        gender_customer,
        Number(id_platform),
      ],
    );

    // 3. Ambil data customer baru
    const customer = await findCustomerById(result.insertId);

    // 4. Generate dan kirim OTP
    try {
      const challenge = createOtpChallenge(customer, "CUSTOMER_REGISTER_OTP");

      await sendOtpEmail(email, challenge.otp, name_customer.trim());

      return res.status(201).json({
        success: true,
        message: "Customer terdaftar. OTP telah dikirim ke email.",
        customer: sanitizeCustomer(customer),
        otp_token: challenge.otp_token,
        expires_in_seconds: challenge.expires_in_seconds,
      });
    } catch (emailError) {
      console.error("signUpCustomer OTP delivery error:", emailError);

      return res.status(202).json({
        success: true,
        message:
          "Registrasi tersimpan, tetapi OTP belum berhasil dikirim. Silakan resend OTP.",
        customer: sanitizeCustomer(customer),
      });
    }
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        error: "Customer already exists",
      });
    }

    return serverError(res, "signUpCustomer", error);
  }
};

// SIGN IN CUSTOMER
export const signInCustomer = async (req, res) => {
  const email = normalizeEmail(req.body.email_customer);

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({
      success: false,
      error: "Email tidak valid",
    });
  }

  try {
    // 1. Cari customer
    const customer = await findCustomerByEmail(email);

    // Jangan membocorkan email terdaftar/tidak
    if (!customer || customer.status_customer !== "ACTIVE") {
      return res.status(200).json({
        success: true,
        message: "Jika email terdaftar dan aktif, OTP akan dikirim.",
      });
    }

    // 2. Generate OTP untuk login
    const challenge = createOtpChallenge(customer, "CUSTOMER_LOGIN_OTP");

    // 3. Kirim email
    await sendOtpEmail(email, challenge.otp);

    // 4. Kirim verification token
    return res.status(200).json({
      success: true,
      message: "Jika email terdaftar dan aktif, OTP akan dikirim.",
      otp_token: challenge.otp_token,
      expires_in_seconds: challenge.expires_in_seconds,
    });
  } catch (error) {
    return serverError(res, "signInCustomer", error);
  }
};

// RESEND CUSTOMER OTP
export const resendCustomerOtp = async (req, res) => {
  const email = normalizeEmail(req.body.email_customer);

  const purpose = req.body.purpose;

  if (!EMAIL_RE.test(email) || !["REGISTER", "LOGIN"].includes(purpose)) {
    return res.status(400).json({
      success: false,
      error: "Email atau purpose tidak valid",
    });
  }

  try {
    const customer = await findCustomerByEmail(email);

    const eligible =
      customer &&
      ((purpose === "REGISTER" && customer.status_customer === "NOT_ACTIVE") ||
        (purpose === "LOGIN" && customer.status_customer === "ACTIVE"));

    if (!eligible) {
      return res.status(200).json({
        success: true,
        message: "Jika akun memenuhi syarat, OTP akan dikirim.",
      });
    }

    const challenge = createOtpChallenge(
      customer,
      purpose === "REGISTER" ? "CUSTOMER_REGISTER_OTP" : "CUSTOMER_LOGIN_OTP",
    );

    await sendOtpEmail(email, challenge.otp);

    return res.status(200).json({
      success: true,
      message: "Jika akun memenuhi syarat, OTP akan dikirim.",
      otp_token: challenge.otp_token,
      expires_in_seconds: challenge.expires_in_seconds,
    });
  } catch (error) {
    return serverError(res, "resendCustomerOtp", error);
  }
};

// VERIFY CUSTOMER REGISTER OTP
export const verifyCustomerOtp = async (req, res) => {
  const email = normalizeEmail(req.body.email_customer);

  const { otp, otp_token } = req.body;

  if (
    !EMAIL_RE.test(email) ||
    typeof otp !== "string" ||
    !OTP_RE.test(otp) ||
    typeof otp_token !== "string"
  ) {
    return res.status(400).json({
      success: false,
      error: "Data verifikasi OTP tidak valid",
    });
  }

  try {
    const customer = await findCustomerByEmail(email);

    if (
      !customer ||
      customer.status_customer !== "NOT_ACTIVE" ||
      !verifyOtpChallenge(customer, otp, otp_token, "CUSTOMER_REGISTER_OTP")
    ) {
      return res.status(400).json({
        success: false,
        error: "OTP tidak valid, kedaluwarsa, atau telah digunakan",
      });
    }

    // Aktivasi customer secara atomik
    const [result] = await db.query(
      `UPDATE customers
       SET status_customer = 'ACTIVE'
       WHERE id_customer = ?
       AND email_customer = ?
       AND status_customer = 'NOT_ACTIVE'`,
      [customer.id_customer, email],
    );

    if (result.affectedRows !== 1) {
      return res.status(400).json({
        success: false,
        error: "OTP telah digunakan atau akun sudah aktif",
      });
    }

    const activeCustomer = {
      ...customer,
      status_customer: "ACTIVE",
    };

    return res.status(200).json({
      success: true,
      message: "Email berhasil diverifikasi, customer aktif.",
      customer: sanitizeCustomer(activeCustomer),
      token: signToken(activeCustomer),
    });
  } catch (error) {
    return serverError(res, "verifyCustomerOtp", error);
  }
};

// VERIFY CUSTOMER LOGIN OTP
export const verifyCustomerLoginOtp = async (req, res) => {
  const email = normalizeEmail(req.body.email_customer);

  const { otp, otp_token } = req.body;

  if (
    !EMAIL_RE.test(email) ||
    typeof otp !== "string" ||
    !OTP_RE.test(otp) ||
    typeof otp_token !== "string"
  ) {
    return res.status(400).json({
      success: false,
      error: "Data verifikasi OTP tidak valid",
    });
  }

  try {
    const customer = await findCustomerByEmail(email);

    if (
      !customer ||
      customer.status_customer !== "ACTIVE" ||
      !verifyOtpChallenge(customer, otp, otp_token, "CUSTOMER_LOGIN_OTP")
    ) {
      return res.status(400).json({
        success: false,
        error: "OTP tidak valid atau kedaluwarsa",
      });
    }

    // JWT hanya dibuat setelah OTP valid
    return res.status(200).json({
      success: true,
      message: "Login successful",
      customer: sanitizeCustomer(customer),
      token: signToken(customer),
    });
  } catch (error) {
    return serverError(res, "verifyCustomerLoginOtp", error);
  }
};

// GET ALL CUSTOMERS
export const getAllCustomers = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
        id_customer,
        name_customer,
        email_customer,
        phone_number_customer,
        dob_customer,
        gender_customer,
        id_platform,
        status_customer
      FROM customers
      ORDER BY id_customer DESC`,
    );

    return res.status(200).json({
      customers: rows,
    });
  } catch (error) {
    return serverError(res, "getAllCustomers", error);
  }
};

// GET CUSTOMER BY ID
export const getCustomerById = async (req, res) => {
  const { id } = req.params;

  if (!ID_RE.test(String(id)) || !Number.isSafeInteger(Number(id))) {
    return res.status(400).json({
      error: "Invalid customer ID",
    });
  }

  try {
    const customer = await findCustomerById(id);

    if (!customer) {
      return res.status(404).json({
        error: "Customer not found",
      });
    }

    return res.status(200).json({
      customer: sanitizeCustomer(customer),
    });
  } catch (error) {
    return serverError(res, "getCustomerById", error);
  }
};
