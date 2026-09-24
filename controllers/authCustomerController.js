import { db } from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendForgotPasswordEmail } from "../utils/mailer.js";

const signToken = (customer) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }

  return jwt.sign(
    {
      sub: customer.id_customer,
      id_customer: customer.id_customer,
      name_customer: customer.name_customer,
      email_customer: customer.email_customer,
      actor_type: "CUSTOMER",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "15min",
      issuer: "my-app",
      audience: "my-app-users",
      algorithm: "HS256",
    },
  );
};

const sanitizeCustomer = (customer) => ({
  id_customer: customer.id_customer,
  name_customer: customer.name_customer,
  email_customer: customer.email_customer,
  phone_number_customer: customer.phone_number_customer,
  dob_customer: customer.dob_customer,
  gender_customer: customer.gender_customer,
  id_platform: customer.id_platform,
});

// --- SIGN UP ---
export const signUpCustomer = async (req, res) => {
  const {
    name_customer,
    email_customer,
    password_customer,
    phone_number_customer,
    dob_customer,
    gender_customer,
    id_platform,
  } = req.body;

  // Validasi field wajib
  if (
    !name_customer ||
    !email_customer ||
    !password_customer ||
    !phone_number_customer ||
    !dob_customer ||
    !gender_customer ||
    !id_platform
  ) {
    return res.status(400).json({
      error: "All fields are required",
    });
  }

  if (password_customer.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters",
    });
  }

  try {
    const normalizedEmail = email_customer.trim().toLowerCase();

    // 1. Cek apakah customer sudah terdaftar
    const [existRows] = await db.query(
      `
        SELECT id_customer
        FROM customers
        WHERE email_customer = ?
        LIMIT 1
      `,
      [normalizedEmail],
    );

    if (existRows.length > 0) {
      return res.status(409).json({
        error: "Customer already exists",
      });
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password_customer, 10);

    // 3. Insert customer
    const [insertResult] = await db.query(
      `
        INSERT INTO customers (
          name_customer,
          email_customer,
          password_customer,
          phone_number_customer,
          dob_customer,
          gender_customer,
          id_platform
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name_customer,
        normalizedEmail,
        hashedPassword,
        phone_number_customer,
        dob_customer,
        gender_customer,
        id_platform,
      ],
    );

    // 4. Ambil customer yang baru dibuat
    const [customerRows] = await db.query(
      `
        SELECT
          id_customer,
          name_customer,
          email_customer,
          phone_number_customer,
          dob_customer,
          gender_customer,
          id_platform
        FROM customers
        WHERE id_customer = ?
        LIMIT 1
      `,
      [insertResult.insertId],
    );

    const customer = customerRows[0];

    // 5. Generate JWT
    const token = signToken(customer);

    return res.status(201).json({
      message: "Customer registered successfully",
      customer: sanitizeCustomer(customer),
      token,
    });
  } catch (err) {
    console.error("signUpCustomer error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- SIGN IN ---
export const signInCustomer = async (req, res) => {
  const { email_customer, password_customer } = req.body;

  if (!email_customer || !password_customer) {
    return res.status(400).json({
      error: "Email and password are required",
    });
  }

  try {
    const normalizedEmail = email_customer.trim().toLowerCase();

    // 1. Cari customer
    const [rows] = await db.query(
      `
        SELECT
          id_customer,
          name_customer,
          email_customer,
          password_customer,
          phone_number_customer,
          dob_customer,
          gender_customer,
          id_platform
        FROM customers
        WHERE email_customer = ?
        LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Customer not found",
      });
    }

    const customer = rows[0];

    // 2. Verifikasi password
    const isPasswordValid = await bcrypt.compare(
      password_customer,
      customer.password_customer,
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Invalid password",
      });
    }

    // 3. Generate token
    const token = signToken(customer);

    return res.status(200).json({
      message: "Login successful",
      customer: sanitizeCustomer(customer),
      token,
    });
  } catch (err) {
    console.error("signInCustomer error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- GET ALL ---
export const getAllCustomers = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
        SELECT
          id_customer,
          name_customer,
          email_customer,
          phone_number_customer,
          dob_customer,
          gender_customer,
          id_platform
        FROM customers
        ORDER BY id_customer DESC
      `,
    );

    return res.status(200).json({
      customers: rows,
    });
  } catch (err) {
    console.error("getAllCustomers error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- GET BY ID ---
export const getCustomerById = async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await db.query(
      `
        SELECT
          id_customer,
          name_customer,
          email_customer,
          phone_number_customer,
          dob_customer,
          gender_customer,
          id_platform
        FROM customers
        WHERE id_customer = ?
        LIMIT 1
      `,
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Customer not found",
      });
    }

    return res.status(200).json({
      customer: rows[0],
    });
  } catch (err) {
    console.error("getCustomerById error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- FORGOT PASSWORD ---
export const forgotPasswordCustomer = async (req, res) => {
  const { email_customer } = req.body;

  if (!email_customer) {
    return res.status(400).json({
      error: "Email is required",
    });
  }

  try {
    const normalizedEmail = email_customer.trim().toLowerCase();

    // 1. Cari customer
    const [rows] = await db.query(
      `
        SELECT
          id_customer,
          name_customer,
          email_customer
        FROM customers
        WHERE email_customer = ?
        LIMIT 1
      `,
      [normalizedEmail],
    );

    /*
      Tetap return response yang sama apabila email tidak terdaftar.
      Tujuannya agar endpoint tidak membocorkan daftar email customer.
    */
    if (rows.length === 0) {
      return res.status(200).json({
        message: "Reset password link has been sent to your email",
      });
    }

    const customer = rows[0];

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not set");
    }

    // 2. Generate reset token khusus customer
    const resetToken = jwt.sign(
      {
        id_customer: customer.id_customer,
        email_customer: customer.email_customer,
        type: "password-reset-customer",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "15m",
        issuer: "my-app",
        audience: "my-app-users",
        algorithm: "HS256",
      },
    );

    // 3. Generate reset password URL
    const resetUrl = `${process.env.FRONTEND_URL}/customer/reset-password/${resetToken}`;

    // 4. Kirim email
    await sendForgotPasswordEmail(
      customer.email_customer,
      customer.name_customer,
      resetUrl,
    );

    return res.status(200).json({
      message: "Reset password link has been sent to your email",
    });
  } catch (err) {
    console.error("forgotPasswordCustomer error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- RESET PASSWORD ---
export const resetPasswordCustomer = async (req, res) => {
  const { token } = req.params;
  const { new_password } = req.body;

  if (!token || !new_password) {
    return res.status(400).json({
      error: "Token and new password are required",
    });
  }

  if (new_password.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters",
    });
  }

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not set");
    }

    // 1. Verify JWT reset password
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "my-app",
      audience: "my-app-users",
      algorithms: ["HS256"],
    });

    // 2. Pastikan token benar-benar token reset customer
    if (decoded.type !== "password-reset-customer") {
      return res.status(400).json({
        error: "Invalid token type",
      });
    }

    // 3. Pastikan customer masih tersedia
    const [rows] = await db.query(
      `
        SELECT id_customer
        FROM customers
        WHERE id_customer = ?
          AND email_customer = ?
        LIMIT 1
      `,
      [decoded.id_customer, decoded.email_customer],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Customer not found",
      });
    }

    // 4. Hash password baru
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // 5. Update password customer
    await db.query(
      `
        UPDATE customers
        SET password_customer = ?
        WHERE id_customer = ?
      `,
      [hashedPassword, decoded.id_customer],
    );

    return res.status(200).json({
      message: "Password has been reset successfully",
    });
  } catch (err) {
    console.error("resetPasswordCustomer error:", err);

    if (err.name === "TokenExpiredError") {
      return res.status(400).json({
        error: "Reset password link has expired",
      });
    }

    if (err.name === "JsonWebTokenError") {
      return res.status(400).json({
        error: "Invalid reset password token",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};
