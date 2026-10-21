import { db } from "../config/db.js";

export async function createGuest({
  name_guest,
  email_guest,
  gender_guest,
  phone_number_guest,
  id_customer,
}) {
  const [result] = await db.query(
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
    [name_guest, email_guest, gender_guest, phone_number_guest, id_customer],
  );

  return getGuestById(result.insertId, id_customer);
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
