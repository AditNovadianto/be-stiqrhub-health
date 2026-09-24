import { db } from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendForgotPasswordEmail } from "../utils/mailer.js";

const signToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }

  return jwt.sign(
    {
      sub: user.id_user,
      name_user: user.name_user,
      email_user: user.email_user,
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

const sanitizeUser = (u) => ({
  id_user: u.id_user,
  name_user: u.name_user,
  email_user: u.email_user,
  status_user: u.status_user,
  id_platform: u.id_platform,
  id_user_role: u.id_user_role,
});

// --- SIGN UP ---
export const signUpUser = async (req, res) => {
  const { name_user, email_user, password_user, status_user, id_user_role } =
    req.body;

  try {
    // 1) cek user sudah ada?
    const [existRows] = await db.query(
      "SELECT id_user FROM users WHERE email_user = ? LIMIT 1",
      [email_user],
    );

    if (existRows.length > 0) {
      return res.status(409).json({ error: "User already exists" });
    }

    // 2) hash password
    const hashed = await bcrypt.hash(password_user, 10);

    // 3) insert user
    const [insertRes] = await db.query(
      "INSERT INTO users (name_user, email_user, password_user, status_user, id_platform, id_user_role) VALUES (?, ?, ?, ?, ?, ?)",
      [name_user, email_user, hashed, status_user, 1, id_user_role],
    );

    // 4) ambil user baru
    const [newUserRows] = await db.query(
      "SELECT id_user, name_user, email_user, status_user, id_user_role FROM users WHERE id_user = ?",
      [insertRes.insertId],
    );

    const newUser = newUserRows[0];

    // 5) buat token
    const token = signToken(newUser);

    return res.status(201).json({
      message: "User registered successfully",
      user: sanitizeUser(newUser),
      token,
    });
  } catch (err) {
    console.error("signUp error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// --- SIGN IN ---
export const signInUser = async (req, res) => {
  const { email_user, password_user } = req.body;

  try {
    // 1) ambil user
    const [rows] = await db.query(
      "SELECT id_user, name_user, email_user, password_user, status_user, id_user_role FROM users WHERE email_user = ? LIMIT 1",
      [email_user],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = rows[0];

    // 2) verifikasi password
    const ok = await bcrypt.compare(password_user, user.password_user);

    if (!ok) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // 3) buat token
    const token = signToken(user);

    return res
      .status(200)
      .json({ message: "Login successful", user: sanitizeUser(user), token });
  } catch (err) {
    console.error("signIn error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id_user, name_user, email_user, status_user, id_user_role FROM users",
    );

    return res.status(200).json({ users: rows });
  } catch (err) {
    console.error("getAllUsers error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// --- FORGOT PASSWORD ---
export const forgotPassword = async (req, res) => {
  const { email_user } = req.body;

  if (!email_user) {
    return res.status(400).json({
      error: "Email is required",
    });
  }

  try {
    const normalizedEmail = email_user.trim().toLowerCase();

    // 1. Cari user
    const [rows] = await db.query(
      `
        SELECT
          id_user,
          name_user,
          email_user,
          status_user
        FROM users
        WHERE email_user = ?
        LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(200).json({
        message: "Reset password link has been sent to your email",
      });
    }

    const user = rows[0];

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not set");
    }

    // 2. Generate reset token
    const resetToken = jwt.sign(
      {
        id_user: user.id_user,
        email_user: user.email_user,
        type: "password-reset-user",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "15m",
        issuer: "my-app",
        audience: "my-app-users",
        algorithm: "HS256",
      },
    );

    // 3. Generate URL reset password
    const resetUrl = `${process.env.FRONTEND_URL}/user/reset-password/${resetToken}`;

    // 4. Kirim email menggunakan mailer.js
    await sendForgotPasswordEmail(user.email_user, user.name_user, resetUrl);

    return res.status(200).json({
      message: "Reset password link has been sent to your email",
    });
  } catch (err) {
    console.error("forgotPassword user error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- RESET PASSWORD ---
export const resetPassword = async (req, res) => {
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

    // 1. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "my-app",
      audience: "my-app-users",
      algorithms: ["HS256"],
    });

    // 2. Pastikan jenis token benar
    if (decoded.type !== "password-reset-user") {
      return res.status(400).json({
        error: "Invalid token type",
      });
    }

    // 3. Cari user
    const [rows] = await db.query(
      `
        SELECT id_user
        FROM users
        WHERE id_user = ?
          AND email_user = ?
        LIMIT 1
      `,
      [decoded.id_user, decoded.email_user],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    // 4. Hash password baru
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // 5. Update password
    await db.query(
      `
        UPDATE users
        SET password_user = ?
        WHERE id_user = ?
      `,
      [hashedPassword, decoded.id_user],
    );

    return res.status(200).json({
      message: "Password has been reset successfully",
    });
  } catch (err) {
    console.error("resetPassword user error:", err);

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
