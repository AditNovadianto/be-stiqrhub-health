import { createHash } from "crypto";
import { db } from "../config/db.js";

const errorWithStatus = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export async function getGuestByEmail(id_customer, email_guest) {
  const normalizedEmail = String(email_guest).trim().toLowerCase();

  const [rows] = await db.query(
    `
      SELECT
        id_guest,
        name_guest,
        email_guest,
        gender_guest,
        phone_number_guest,
        id_customer
      FROM guests
      WHERE id_customer = ?
        AND LOWER(TRIM(email_guest)) = ?
      ORDER BY id_guest ASC
      LIMIT 1
    `,
    [id_customer, normalizedEmail],
  );

  return rows[0] || null;
}

export async function createGuest({
  name_guest,
  email_guest,
  gender_guest,
  phone_number_guest = null,
  id_customer,
}) {
  const normalizedEmail = String(email_guest).trim().toLowerCase();

  // Lock berdasarkan customer + email.
  // Semua request untuk pasangan customer/email yang sama
  // menggunakan lock yang sama, termasuk antarinstance server.
  const lockName =
    "guest:" +
    createHash("sha256")
      .update(`${id_customer}:${normalizedEmail}`)
      .digest("hex")
      .slice(0, 58);

  const connection = await db.getConnection();

  let lockAcquired = false;

  try {
    const [lockRows] = await connection.query(
      "SELECT GET_LOCK(?, 10) AS acquired",
      [lockName],
    );

    if (lockRows[0]?.acquired !== 1) {
      throw errorWithStatus(
        "Sistem sedang memproses data guest. Silakan coba lagi",
        503,
      );
    }

    lockAcquired = true;

    // Pengecekan harus dilakukan setelah memperoleh lock.
    // Dengan demikian request bersamaan tidak bisa sama-sama
    // melewati pemeriksaan sebelum INSERT.
    const [existingRows] = await connection.query(
      `
        SELECT
          id_guest,
          name_guest,
          email_guest,
          gender_guest,
          phone_number_guest,
          id_customer
        FROM guests
        WHERE id_customer = ?
          AND LOWER(TRIM(email_guest)) = ?
        ORDER BY id_guest ASC
        LIMIT 1
      `,
      [id_customer, normalizedEmail],
    );

    if (existingRows.length > 0) {
      const error = errorWithStatus(
        "Email guest sudah terdaftar. Silakan pilih guest yang sudah tersedia",
        409,
      );

      error.existingGuest = existingRows[0];

      throw error;
    }

    // Email belum ditemukan, lanjut INSERT.
    const [result] = await connection.query(
      `
        INSERT INTO guests (
          name_guest,
          email_guest,
          gender_guest,
          phone_number_guest,
          id_customer
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        name_guest,
        normalizedEmail,
        gender_guest,
        phone_number_guest,
        id_customer,
      ],
    );

    const [guestRows] = await connection.query(
      `
        SELECT
          id_guest,
          name_guest,
          email_guest,
          gender_guest,
          phone_number_guest,
          id_customer
        FROM guests
        WHERE id_guest = ?
          AND id_customer = ?
        LIMIT 1
      `,
      [result.insertId, id_customer],
    );

    if (guestRows.length === 0) {
      throw errorWithStatus(
        "Guest berhasil disimpan tetapi tidak ditemukan",
        500,
      );
    }

    return guestRows[0];
  } finally {
    if (lockAcquired) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?) AS released", [
          lockName,
        ]);
      } catch (releaseError) {
        console.error("[GUEST LOCK RELEASE ERROR]", releaseError);

        // Jangan mengembalikan connection yang masih
        // memegang lock ke pool.
        connection.destroy();
        return;
      }
    }

    connection.release();
  }
}

export async function getAllGuests(id_customer) {
  const [rows] = await db.query(
    `
      SELECT
        id_guest,
        name_guest,
        email_guest,
        gender_guest,
        phone_number_guest,
        id_customer
      FROM guests
      WHERE id_customer = ?
      ORDER BY id_guest DESC
    `,
    [id_customer],
  );

  return rows;
}

export async function getGuestById(id_guest, id_customer) {
  const [rows] = await db.query(
    `
      SELECT
        id_guest,
        name_guest,
        email_guest,
        gender_guest,
        phone_number_guest,
        id_customer
      FROM guests
      WHERE id_guest = ?
        AND id_customer = ?
      LIMIT 1
    `,
    [id_guest, id_customer],
  );

  return rows[0] || null;
}
