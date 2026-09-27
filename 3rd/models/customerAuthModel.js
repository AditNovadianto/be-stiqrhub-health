import { db } from "../../config/db.js";

import { encryptToken, decryptToken } from "../utils/tokenCrypto.js";

const toSqlDate = (value) => {
  if (!value) return null;

  let date;

  if (value instanceof Date) {
    date = value;
  } else if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
  ) {
    date = new Date(value.replace(" ", "T") + "Z");
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    const error = new Error("Invalid DANA token expiry date");

    error.statusCode = 502;
    throw error;
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
};

const conflict = (message) => {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
};

export const CustomerAuthModel = {
  async findByDanaCustomerId(danaCustomerId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT
         ca.id_customer_auth,
         ca.id_customer,
         ca.dana_customer_id,
         c.name_customer,
         c.email_customer
       FROM customer_auth ca
       JOIN customers c
         ON c.id_customer = ca.id_customer
       WHERE ca.dana_customer_id = ?
       LIMIT 1`,
      [danaCustomerId],
    );

    return rows[0] || null;
  },

  async findByCustomerId(idCustomer, conn = db) {
    const [rows] = await conn.execute(
      `SELECT *
       FROM customer_auth
       WHERE id_customer = ?
       LIMIT 1`,
      [idCustomer],
    );

    return rows[0] || null;
  },

  async saveDanaToken(
    {
      idCustomer,
      danaCustomerId,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    },
    conn,
  ) {
    if (!conn) {
      throw new Error("Database transaction is required");
    }

    if (!idCustomer || !danaCustomerId || !accessToken) {
      const error = new Error("Incomplete DANA authentication data");

      error.statusCode = 400;
      throw error;
    }

    const [customerRows] = await conn.execute(
      `SELECT id_customer
       FROM customers
       WHERE id_customer = ?
       FOR UPDATE`,
      [idCustomer],
    );

    if (!customerRows.length) {
      const error = new Error("Customer not found");
      error.statusCode = 404;
      throw error;
    }

    const [rows] = await conn.execute(
      `SELECT *
       FROM customer_auth
       WHERE id_customer = ?
          OR dana_customer_id = ?
       FOR UPDATE`,
      [idCustomer, danaCustomerId],
    );

    const byCustomer = rows.find(
      (row) => Number(row.id_customer) === Number(idCustomer),
    );

    const byDana = rows.find((row) => row.dana_customer_id === danaCustomerId);

    if (byDana && Number(byDana.id_customer) !== Number(idCustomer)) {
      throw conflict("DANA account is linked to another customer");
    }

    if (
      byCustomer?.dana_customer_id &&
      byCustomer.dana_customer_id !== danaCustomerId
    ) {
      throw conflict("Customer is linked to another DANA account");
    }

    const encryptedAccess = encryptToken(accessToken);

    const encryptedRefresh = refreshToken ? encryptToken(refreshToken) : null;

    const accessExpiry = toSqlDate(accessTokenExpiresAt);

    const refreshExpiry = toSqlDate(refreshTokenExpiresAt);

    if (byCustomer) {
      await conn.execute(
        `UPDATE customer_auth
         SET
           dana_customer_id = ?,
           access_token = ?,
           access_token_expires_at = ?,
           refresh_token = COALESCE(
             ?,
             refresh_token
           ),
           refresh_token_expires_at = COALESCE(
             ?,
             refresh_token_expires_at
           )
         WHERE id_customer = ?`,
        [
          danaCustomerId,
          encryptedAccess,
          accessExpiry,
          encryptedRefresh,
          refreshExpiry,
          idCustomer,
        ],
      );
    } else {
      await conn.execute(
        `INSERT INTO customer_auth (
           id_customer,
           dana_customer_id,
           access_token,
           access_token_expires_at,
           refresh_token,
           refresh_token_expires_at
         )
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          idCustomer,
          danaCustomerId,
          encryptedAccess,
          accessExpiry,
          encryptedRefresh,
          refreshExpiry,
        ],
      );
    }

    return {
      idCustomer: Number(idCustomer),
      danaCustomerId,
      linked: true,
    };
  },

  async getStatus(idCustomer) {
    const auth = await this.findByCustomerId(idCustomer);

    if (!auth) {
      return {
        linked: false,
        danaCustomerId: null,
        accessTokenExpiresAt: null,
      };
    }

    return {
      linked: Boolean(auth.dana_customer_id),
      danaCustomerId: auth.dana_customer_id,
      accessTokenExpiresAt: auth.access_token_expires_at,
    };
  },

  async getDecryptedAccessToken(idCustomer) {
    const auth = await this.findByCustomerId(idCustomer);

    return auth?.access_token ? decryptToken(auth.access_token) : null;
  },

  async getDecryptedRefreshToken(idCustomer) {
    const auth = await this.findByCustomerId(idCustomer);

    return auth?.refresh_token ? decryptToken(auth.refresh_token) : null;
  },
};
