import { db } from "../config/db.js";

// HELPERS
const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
};

const normalizeHealthPassStatus = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase();
};

const validateHealthPassTime = (healthPass) => {
  const now = new Date();

  const validFrom = new Date(healthPass.valid_from);

  const validUntil = new Date(healthPass.valid_until);

  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) {
    throw errorWithStatus("Masa berlaku Health Pass tidak valid", 500);
  }

  if (now < validFrom) {
    throw errorWithStatus("Health Pass belum dapat digunakan", 409);
  }

  if (now > validUntil) {
    throw errorWithStatus("Health Pass sudah melewati masa berlaku", 409);
  }
};

// BASE SELECT
const HEALTH_PASS_SELECT = `
  SELECT
    hp.id_health_pass,
    hp.status_health_pass,
    hp.valid_from,
    hp.valid_until,
    hp.booking_at,
    hp.redeemed_at,
    hp.redeemed_by,
    hp.id_order,

    o.id_customer,
    o.id_service,
    o.payment_status,
    o.order_status,

    c.name_customer,
    c.email_customer,
    c.phone_number_customer,

    s.name_service,
    s.price_service,
    s.image_service,
    s.description_service,
    s.id_provider,

    p.name_provider

  FROM health_passes hp

  INNER JOIN orders o
    ON hp.id_order =
       o.id_order

  INNER JOIN customers c
    ON o.id_customer =
       c.id_customer

  INNER JOIN services s
    ON o.id_service =
       s.id_service

  INNER JOIN providers p
    ON s.id_provider =
       p.id_provider
`;

// GET HEALTH PASS BY ID
export async function getHealthPassById(id_health_pass) {
  const [rows] = await db.query(
    `
        ${HEALTH_PASS_SELECT}

        WHERE hp.id_health_pass = ?

        LIMIT 1
      `,
    [id_health_pass],
  );

  return rows[0] || null;
}

// GET HEALTH PASS BY ORDER
export async function getHealthPassByOrder(id_order) {
  const [rows] = await db.query(
    `
        ${HEALTH_PASS_SELECT}

        WHERE hp.id_order = ?

        LIMIT 1
      `,
    [id_order],
  );

  return rows[0] || null;
}

// GET HEALTH PASS BY ORDER + CUSTOMER
//
// Digunakan oleh Mini Program customer.
// Customer hanya boleh melihat Health Pass miliknya sendiri.
export async function getHealthPassByOrderForCustomer(id_order, id_customer) {
  const [rows] = await db.query(
    `
        ${HEALTH_PASS_SELECT}

        WHERE hp.id_order = ?
          AND o.id_customer = ?

        LIMIT 1
      `,
    [id_order, id_customer],
  );

  return rows[0] || null;
}

// GET HEALTH PASSES BY CUSTOMER
export async function getHealthPassesByCustomer(id_customer) {
  const [rows] = await db.query(
    `
        ${HEALTH_PASS_SELECT}

        WHERE o.id_customer = ?

        ORDER BY
          hp.booking_at DESC
      `,
    [id_customer],
  );

  return rows;
}

// GET HEALTH PASSES BY PROVIDER
export async function getHealthPassesByProvider(id_provider) {
  const [rows] = await db.query(
    `
        ${HEALTH_PASS_SELECT}

        WHERE s.id_provider = ?

        ORDER BY
          hp.booking_at DESC
      `,
    [id_provider],
  );

  return rows;
}

// VALIDATE HEALTH PASS FOR PROVIDER
//
// Digunakan oleh:
// - QR verify
// - manual ID verify
// - sebelum redeem
export async function validateHealthPassForProvider(
  id_health_pass,
  id_provider,
) {
  const healthPass = await getHealthPassById(id_health_pass);

  if (!healthPass) {
    throw errorWithStatus("Health Pass tidak ditemukan", 404);
  }

  // PROVIDER OWNERSHIP
  if (Number(healthPass.id_provider) !== Number(id_provider)) {
    throw errorWithStatus("Health Pass bukan milik provider ini", 403);
  }

  // ORDER MUST BE APPROVED
  if (
    normalizeHealthPassStatus(healthPass.payment_status) !== "APPROVED" ||
    normalizeHealthPassStatus(healthPass.order_status) !== "APPROVED"
  ) {
    throw errorWithStatus("Order Health Pass belum disetujui", 409);
  }

  // HEALTH PASS STATUS
  const status = normalizeHealthPassStatus(healthPass.status_health_pass);

  if (status === "REDEEMED") {
    throw errorWithStatus("Health Pass sudah pernah digunakan", 409);
  }

  if (status !== "ACTIVE") {
    throw errorWithStatus(
      `Health Pass tidak aktif. Status saat ini: ${status}`,
      409,
    );
  }

  // VALIDITY TIME
  validateHealthPassTime(healthPass);

  return healthPass;
}

// REDEEM HEALTH PASS
//
// Function ini dipakai oleh dua mekanisme:
//
// 1. QR redeem
// 2. Manual ID redeem
//
// Semua masuk ke function yang sama agar business logic
// tidak duplicated.
export async function redeemHealthPass({
  id_health_pass,
  id_provider,
  redeemed_by,
}) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. LOCK HEALTH PASS
    const [rows] = await connection.query(
      `
          SELECT
            hp.id_health_pass,
            hp.status_health_pass,
            hp.valid_from,
            hp.valid_until,
            hp.booking_at,
            hp.redeemed_at,
            hp.redeemed_by,
            hp.id_order,

            o.id_customer,
            o.id_service,
            o.payment_status,
            o.order_status,

            s.id_provider,
            s.name_service,

            p.name_provider,

            c.name_customer,
            c.email_customer,
            c.phone_number_customer

          FROM health_passes hp

          INNER JOIN orders o
            ON hp.id_order =
               o.id_order

          INNER JOIN services s
            ON o.id_service =
               s.id_service

          INNER JOIN providers p
            ON s.id_provider =
               p.id_provider

          INNER JOIN customers c
            ON o.id_customer =
               c.id_customer

          WHERE hp.id_health_pass = ?

          LIMIT 1

          FOR UPDATE
        `,
      [id_health_pass],
    );

    if (rows.length === 0) {
      throw errorWithStatus("Health Pass tidak ditemukan", 404);
    }

    const healthPass = rows[0];

    // 2. VALIDATE PROVIDER
    if (Number(healthPass.id_provider) !== Number(id_provider)) {
      throw errorWithStatus("Health Pass bukan milik provider ini", 403);
    }

    // 3. VALIDATE ORDER
    if (
      healthPass.payment_status !== "APPROVED" ||
      healthPass.order_status !== "APPROVED"
    ) {
      throw errorWithStatus("Order Health Pass belum disetujui", 409);
    }

    // 4. VALIDATE STATUS
    const status = normalizeHealthPassStatus(healthPass.status_health_pass);

    if (status === "REDEEMED") {
      throw errorWithStatus("Health Pass sudah pernah digunakan", 409);
    }

    if (status !== "ACTIVE") {
      throw errorWithStatus(
        `Health Pass tidak dapat diredeem. Status: ${status}`,
        409,
      );
    }

    // 5. VALIDATE TIME
    validateHealthPassTime(healthPass);

    // 6. REDEEM
    const [result] = await connection.query(
      `
          UPDATE health_passes

          SET
            status_health_pass =
              'REDEEMED',

            redeemed_at =
              NOW(),

            redeemed_by = ?

          WHERE id_health_pass = ?
            AND status_health_pass =
              'ACTIVE'
        `,
      [redeemed_by, id_health_pass],
    );

    if (result.affectedRows !== 1) {
      throw errorWithStatus("Health Pass gagal diredeem", 409);
    }

    // 7. GET UPDATED HEALTH PASS
    const [updatedRows] = await connection.query(
      `
          SELECT
            id_health_pass,
            status_health_pass,
            valid_from,
            valid_until,
            booking_at,
            redeemed_at,
            redeemed_by,
            id_order

          FROM health_passes

          WHERE id_health_pass = ?

          LIMIT 1
        `,
      [id_health_pass],
    );

    await connection.commit();

    return {
      ...healthPass,

      status_health_pass: "REDEEMED",

      redeemed_at: updatedRows[0]?.redeemed_at || null,

      redeemed_by: updatedRows[0]?.redeemed_by || redeemed_by,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}
