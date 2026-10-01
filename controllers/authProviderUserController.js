import { db } from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendForgotPasswordEmail } from "../utils/mailer.js";

const signToken = (providerUser) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
  }

  return jwt.sign(
    {
      sub: providerUser.id_provider_user,
      name_provider_user: providerUser.name_provider_user,
      email_provider_user: providerUser.email_provider_user,
      id_provider: providerUser.id_provider,
      id_provider_role: providerUser.id_provider_role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "15min",
      issuer: "my-app",
      audience: "my-app-provider-users",
      algorithm: "HS256",
    },
  );
};

const sanitizeProviderUser = (providerUser) => ({
  id_provider_user: providerUser.id_provider_user,
  name_provider_user: providerUser.name_provider_user,
  email_provider_user: providerUser.email_provider_user,
  phone_number_provider_user: providerUser.phone_number_provider_user,
  status_provider_user: providerUser.status_provider_user,
  id_provider: providerUser.id_provider,
  id_provider_role: providerUser.id_provider_role,
});

// --- SIGN UP ---
export const signUpProviderUser = async (req, res) => {
  const {
    name_provider_user,
    email_provider_user,
    password_provider_user,
    phone_number_provider_user,
    status_provider_user,
    id_provider,
    id_provider_role,
  } = req.body;

  if (
    !name_provider_user ||
    !email_provider_user ||
    !password_provider_user ||
    !id_provider ||
    !id_provider_role
  ) {
    return res.status(400).json({
      error: "Name, email, password, provider, and provider role are required",
    });
  }

  if (password_provider_user.length < 8) {
    return res.status(400).json({
      error: "Password must be at least 8 characters",
    });
  }

  try {
    const normalizedEmail = email_provider_user.trim().toLowerCase();

    const [providerRows] = await db.query(
      `
        SELECT
          id_provider,
          status_provider
        FROM providers
        WHERE id_provider = ?
        LIMIT 1
      `,
      [id_provider],
    );

    if (providerRows.length === 0) {
      return res.status(404).json({
        error: "Provider not found",
      });
    }

    const provider = providerRows[0];

    if (provider.status_provider !== "APPROVED") {
      return res.status(403).json({
        error: "Provider has not been approved",
      });
    }

    const [roleRows] = await db.query(
      `
        SELECT id_provider_role
        FROM provider_roles
        WHERE id_provider_role = ?
        LIMIT 1
      `,
      [id_provider_role],
    );

    if (roleRows.length === 0) {
      return res.status(404).json({
        error: "Provider role not found",
      });
    }

    const [existRows] = await db.query(
      `
        SELECT id_provider_user
        FROM provider_users
        WHERE email_provider_user = ?
        LIMIT 1
      `,
      [normalizedEmail],
    );

    if (existRows.length > 0) {
      return res.status(409).json({
        error: "Provider user already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password_provider_user, 10);

    const [insertResult] = await db.query(
      `
        INSERT INTO provider_users (
          name_provider_user,
          email_provider_user,
          password_provider_user,
          phone_number_provider_user,
          status_provider_user,
          id_provider,
          id_provider_role
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name_provider_user.trim(),
        normalizedEmail,
        hashedPassword,
        phone_number_provider_user?.trim() || null,
        status_provider_user?.trim() || "ACTIVE",
        id_provider,
        id_provider_role,
      ],
    );

    const [newProviderUserRows] = await db.query(
      `
        SELECT
          id_provider_user,
          name_provider_user,
          email_provider_user,
          phone_number_provider_user,
          status_provider_user,
          id_provider,
          id_provider_role
        FROM provider_users
        WHERE id_provider_user = ?
        LIMIT 1
      `,
      [insertResult.insertId],
    );

    const newProviderUser = newProviderUserRows[0];

    const token = signToken(newProviderUser);

    return res.status(201).json({
      message: "Provider user registered successfully",
      provider_user: sanitizeProviderUser(newProviderUser),
      token,
    });
  } catch (err) {
    console.error("signUpProviderUser error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Provider user already exists",
      });
    }

    if (err.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        error: "Provider or provider role is invalid",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- SIGN IN ---
export const signInProviderUser = async (req, res) => {
  const { email_provider_user, password_provider_user } = req.body;

  if (!email_provider_user || !password_provider_user) {
    return res.status(400).json({
      error: "Email and password are required",
    });
  }

  try {
    const normalizedEmail = email_provider_user.trim().toLowerCase();

    const [rows] = await db.query(
      `
        SELECT
          pu.id_provider_user,
          pu.name_provider_user,
          pu.email_provider_user,
          pu.password_provider_user,
          pu.phone_number_provider_user,
          pu.status_provider_user,
          pu.id_provider,
          pu.id_provider_role,
          p.status_provider,
          pr.name_provider_role
        FROM provider_users pu
        INNER JOIN providers p
          ON pu.id_provider = p.id_provider
        INNER JOIN provider_roles pr
          ON pu.id_provider_role = pr.id_provider_role
        WHERE pu.email_provider_user = ?
        LIMIT 1
      `,
      [normalizedEmail],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Provider user not found",
      });
    }

    const providerUser = rows[0];

    if (providerUser.status_provider_user !== "ACTIVE") {
      return res.status(403).json({
        error: "Provider user is not active",
      });
    }

    if (providerUser.status_provider !== "APPROVED") {
      return res.status(403).json({
        error: "Provider has not been approved",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password_provider_user,
      providerUser.password_provider_user,
    );

    if (!passwordMatch) {
      return res.status(401).json({
        error: "Invalid password",
      });
    }

    const token = signToken(providerUser);

    return res.status(200).json({
      message: "Login successful",
      provider_user: {
        ...sanitizeProviderUser(providerUser),
        name_provider_role: providerUser.name_provider_role,
      },
      token,
    });
  } catch (err) {
    console.error("signInProviderUser error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- GET ALL PROVIDER USERS ---
export const getAllProviderUsers = async (req, res) => {
  try {
    const [rows] = await db.query(
      `
        SELECT
          pu.id_provider_user,
          pu.name_provider_user,
          pu.email_provider_user,
          pu.phone_number_provider_user,
          pu.status_provider_user,
          pu.id_provider,
          p.name_provider,
          pu.id_provider_role,
          pr.name_provider_role
        FROM provider_users pu
        INNER JOIN providers p
          ON pu.id_provider = p.id_provider
        INNER JOIN provider_roles pr
          ON pu.id_provider_role = pr.id_provider_role
        ORDER BY pu.id_provider_user DESC
      `,
    );

    return res.status(200).json({
      provider_users: rows,
    });
  } catch (err) {
    console.error("getAllProviderUsers error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- GET PROVIDER USERS BY PROVIDER ---
export const getProviderUsersByProvider = async (req, res) => {
  const { id_provider } = req.params;

  if (
    !/^[1-9]\d*$/.test(String(id_provider)) ||
    !Number.isSafeInteger(Number(id_provider))
  ) {
    return res.status(400).json({
      error: "Invalid provider ID",
    });
  }

  try {
    const [providerRows] = await db.query(
      `
        SELECT id_provider
        FROM providers
        WHERE id_provider = ?
        LIMIT 1
      `,
      [id_provider],
    );

    if (providerRows.length === 0) {
      return res.status(404).json({
        error: "Provider not found",
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          pu.id_provider_user,
          pu.name_provider_user,
          pu.email_provider_user,
          pu.phone_number_provider_user,
          pu.status_provider_user,
          pu.id_provider,
          pu.id_provider_role,
          pr.name_provider_role
        FROM provider_users pu
        INNER JOIN provider_roles pr
          ON pu.id_provider_role = pr.id_provider_role
        WHERE pu.id_provider = ?
        ORDER BY pu.id_provider_user DESC
      `,
      [id_provider],
    );

    return res.status(200).json({
      provider_users: rows,
    });
  } catch (err) {
    console.error("getProviderUsersByProvider error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- FORGOT PASSWORD ---
export const forgotPasswordProviderUser = async (req, res) => {
  const { email_provider_user } = req.body;

  if (!email_provider_user) {
    return res.status(400).json({
      error: "Email is required",
    });
  }

  try {
    const normalizedEmail = email_provider_user.trim().toLowerCase();

    const [rows] = await db.query(
      `
        SELECT
          id_provider_user,
          name_provider_user,
          email_provider_user,
          status_provider_user
        FROM provider_users
        WHERE email_provider_user = ?
        LIMIT 1
      `,
      [normalizedEmail],
    );

    /*
     * Jangan memberitahu apakah email tersedia atau tidak.
     * Ini mencegah email enumeration.
     */
    if (rows.length === 0) {
      return res.status(200).json({
        message: "Reset password link has been sent to your email",
      });
    }

    const providerUser = rows[0];

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not set");
    }

    const resetToken = jwt.sign(
      {
        id_provider_user: providerUser.id_provider_user,
        email_provider_user: providerUser.email_provider_user,
        type: "password-reset-provider-user",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "15m",
        issuer: "my-app",
        audience: "my-app-provider-users",
        algorithm: "HS256",
      },
    );

    const resetUrl =
      `${process.env.FRONTEND_URL}` + `/provider/reset-password/${resetToken}`;

    await sendForgotPasswordEmail(
      providerUser.email_provider_user,
      providerUser.name_provider_user,
      resetUrl,
    );

    return res.status(200).json({
      message: "Reset password link has been sent to your email",
    });
  } catch (err) {
    console.error("forgotPasswordProviderUser error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// --- RESET PASSWORD ---
export const resetPasswordProviderUser = async (req, res) => {
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "my-app",
      audience: "my-app-provider-users",
      algorithms: ["HS256"],
    });

    if (decoded.type !== "password-reset-provider-user") {
      return res.status(400).json({
        error: "Invalid token type",
      });
    }

    const [rows] = await db.query(
      `
        SELECT id_provider_user
        FROM provider_users
        WHERE id_provider_user = ?
          AND email_provider_user = ?
        LIMIT 1
      `,
      [decoded.id_provider_user, decoded.email_provider_user],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: "Provider user not found",
      });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await db.query(
      `
        UPDATE provider_users
        SET password_provider_user = ?
        WHERE id_provider_user = ?
      `,
      [hashedPassword, decoded.id_provider_user],
    );

    return res.status(200).json({
      message: "Password has been reset successfully",
    });
  } catch (err) {
    console.error("resetPasswordProviderUser error:", err);

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
