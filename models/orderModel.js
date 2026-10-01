import { randomUUID } from "crypto";
import { db } from "../config/db.js";

// HELPERS
const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parsePrice = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
};

const parseQuota = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0) {
    return null;
  }

  return number;
};

const addOneCalendarMonth = (dateValue) => {
  const original = new Date(dateValue);

  if (Number.isNaN(original.getTime())) {
    throw errorWithStatus("Booking date tidak valid", 500);
  }

  const result = new Date(original);

  const originalDay = result.getDate();

  // Pindah ke tanggal 1 supaya tidak overflow saat ganti bulan
  result.setDate(1);
  result.setMonth(result.getMonth() + 1);

  const lastDayOfTargetMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();

  result.setDate(Math.min(originalDay, lastDayOfTargetMonth));

  return result;
};

// GET CUSTOMER BY ID
export async function getCustomerById(id_customer) {
  const [rows] = await db.query(
    `
      SELECT
        id_customer,
        name_customer,
        email_customer,
        phone_number_customer,
        id_platform
      FROM customers
      WHERE id_customer = ?
      LIMIT 1
    `,
    [id_customer],
  );

  return rows[0] || null;
}

// GET SERVICE FOR ORDER
export async function getServiceForOrder(id_service) {
  const [rows] = await db.query(
    `
      SELECT
        s.id_service,
        s.name_service,
        s.price_service,
        s.status_service,
        s.quota_service,
        s.id_provider,

        p.name_provider,
        p.status_provider

      FROM services s

      INNER JOIN providers p
        ON s.id_provider = p.id_provider

      WHERE s.id_service = ?

      LIMIT 1
    `,
    [id_service],
  );

  return rows[0] || null;
}

// CREATE ORDER
export async function createOrder(
  payment_method,
  booking_at,
  id_customer,
  id_service,
) {
  const customer = await getCustomerById(id_customer);

  if (!customer) {
    throw errorWithStatus("Customer tidak ditemukan", 404);
  }

  const service = await getServiceForOrder(id_service);

  if (!service) {
    throw errorWithStatus("Service tidak ditemukan", 404);
  }

  if (service.status_provider !== "APPROVED") {
    throw errorWithStatus("Provider belum disetujui", 403);
  }

  if (service.status_service !== "ACTIVE") {
    throw errorWithStatus("Service sedang tidak aktif", 400);
  }

  const price = parsePrice(service.price_service);

  if (price === null) {
    throw errorWithStatus("Harga service tidak valid", 500);
  }

  const quota = parseQuota(service.quota_service);

  if (quota === null) {
    throw errorWithStatus("Kuota service tidak valid", 500);
  }

  if (quota <= 0) {
    throw errorWithStatus("Kuota service sudah habis", 409);
  }

  const id_order = randomUUID();

  const sub_total = String(price);
  const total = String(price);

  const [result] = await db.query(
    `
      INSERT INTO orders (
        id_order,
        sub_total,
        total,
        payment_method,
        payment_status,
        order_status,
        paid_at,
        booking_at,
        dana_payment_id,
        payment_expired_at,
        payment_updated_at,
        id_customer,
        id_service
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id_order,
      sub_total,
      total,
      payment_method,
      "PENDING",
      "PENDING",
      null,
      booking_at,
      null,
      null,
      null,
      id_customer,
      id_service,
    ],
  );

  if (result.affectedRows === 0) {
    throw errorWithStatus("Order gagal dibuat", 500);
  }

  return id_order;
}

// GET ALL ORDERS
export async function getAllOrders() {
  const [rows] = await db.query(
    `
      SELECT
        o.id_order,
        o.sub_total,
        o.total,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.paid_at,
        o.booking_at,
        o.dana_payment_id,
        o.payment_expired_at,
        o.payment_updated_at,

        o.id_customer,
        c.name_customer,
        c.email_customer,
        c.phone_number_customer,

        o.id_service,
        s.name_service,
        s.price_service,
        s.image_service,

        s.id_provider,
        p.name_provider

      FROM orders o

      INNER JOIN customers c
        ON o.id_customer = c.id_customer

      INNER JOIN services s
        ON o.id_service = s.id_service

      INNER JOIN providers p
        ON s.id_provider = p.id_provider

      ORDER BY o.booking_at DESC
    `,
  );

  return rows;
}

// GET ORDER BY ID
export async function getOrderById(id_order) {
  const [rows] = await db.query(
    `
      SELECT
        o.id_order,
        o.sub_total,
        o.total,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.paid_at,
        o.booking_at,
        o.dana_payment_id,
        o.payment_expired_at,
        o.payment_updated_at,

        o.id_customer,
        c.name_customer,
        c.email_customer,
        c.phone_number_customer,

        o.id_service,
        s.name_service,
        s.price_service,
        s.image_service,
        s.description_service,
        s.maps_service,

        s.id_provider,
        p.name_provider

      FROM orders o

      INNER JOIN customers c
        ON o.id_customer = c.id_customer

      INNER JOIN services s
        ON o.id_service = s.id_service

      INNER JOIN providers p
        ON s.id_provider = p.id_provider

      WHERE o.id_order = ?

      LIMIT 1
    `,
    [id_order],
  );

  return rows[0] || null;
}

// GET ORDERS BY CUSTOMER
export async function getOrdersByCustomer(id_customer) {
  const [rows] = await db.query(
    `
      SELECT
        o.id_order,
        o.sub_total,
        o.total,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.paid_at,
        o.booking_at,
        o.dana_payment_id,
        o.payment_expired_at,
        o.payment_updated_at,

        o.id_service,
        s.name_service,
        s.price_service,
        s.image_service,

        s.id_provider,
        p.name_provider

      FROM orders o

      INNER JOIN services s
        ON o.id_service = s.id_service

      INNER JOIN providers p
        ON s.id_provider = p.id_provider

      WHERE o.id_customer = ?

      ORDER BY o.booking_at DESC
    `,
    [id_customer],
  );

  return rows;
}

// GET ORDERS BY PROVIDER
export async function getOrdersByProvider(id_provider) {
  const [rows] = await db.query(
    `
      SELECT
        o.id_order,
        o.sub_total,
        o.total,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.paid_at,
        o.booking_at,
        o.dana_payment_id,
        o.payment_expired_at,
        o.payment_updated_at,

        o.id_customer,
        c.name_customer,
        c.email_customer,
        c.phone_number_customer,

        o.id_service,
        s.name_service,
        s.price_service

      FROM orders o

      INNER JOIN customers c
        ON o.id_customer = c.id_customer

      INNER JOIN services s
        ON o.id_service = s.id_service

      WHERE s.id_provider = ?

      ORDER BY o.booking_at DESC
    `,
    [id_provider],
  );

  return rows;
}

// GET HEALTH PASS BY ORDER
export async function getHealthPassByOrder(id_order) {
  const [rows] = await db.query(
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
      WHERE id_order = ?
      LIMIT 1
    `,
    [id_order],
  );

  return rows[0] || null;
}

// UPDATE DANA PAYMENT INFO
export async function updateDanaPaymentInfo(
  id_order,
  dana_payment_id,
  payment_expired_at,
) {
  const [result] = await db.query(
    `
      UPDATE orders
      SET
        dana_payment_id = ?,
        payment_expired_at = ?,
        payment_updated_at = NOW()
      WHERE id_order = ?
    `,
    [dana_payment_id, payment_expired_at, id_order],
  );

  return result.affectedRows > 0;
}

// PROCESS PAYMENT CALLBACK
export async function processPaymentCallback({
  id_order,
  payment_status,
  order_status,
  dana_payment_id = null,
  paid_at = null,
  payment_expired_at = null,
}) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [orderRows] = await connection.query(
      `
          SELECT
            o.id_order,
            o.total,
            o.payment_method,
            o.payment_status,
            o.order_status,
            o.paid_at,
            o.booking_at,
            o.dana_payment_id,
            o.payment_expired_at,
            o.id_service,

            s.id_provider

          FROM orders o

          INNER JOIN services s
            ON o.id_service = s.id_service

          WHERE o.id_order = ?

          LIMIT 1

          FOR UPDATE
        `,
      [id_order],
    );

    if (orderRows.length === 0) {
      throw errorWithStatus("Order tidak ditemukan", 404);
    }

    const order = orderRows[0];

    const previousPaymentStatus = order.payment_status;

    const previousOrderStatus = order.order_status;

    const finalPaymentStatus =
      previousPaymentStatus === "APPROVED" ? "APPROVED" : payment_status;

    const finalOrderStatus =
      previousOrderStatus === "APPROVED" ? "APPROVED" : order_status;

    let finalPaidAt = order.paid_at;

    if (finalPaymentStatus === "APPROVED" && !finalPaidAt) {
      finalPaidAt = paid_at || new Date();
    }

    const finalDanaPaymentId = dana_payment_id || order.dana_payment_id || null;

    const finalExpiredAt =
      payment_expired_at || order.payment_expired_at || null;

    await connection.query(
      `
        UPDATE orders
        SET
          payment_status = ?,
          order_status = ?,
          paid_at = ?,
          dana_payment_id = ?,
          payment_expired_at = ?,
          payment_updated_at = NOW()
        WHERE id_order = ?
      `,
      [
        finalPaymentStatus,
        finalOrderStatus,
        finalPaidAt,
        finalDanaPaymentId,
        finalExpiredAt,
        id_order,
      ],
    );

    let balanceUpdated = false;

    const firstPaymentApproval =
      previousPaymentStatus !== "APPROVED" && finalPaymentStatus === "APPROVED";

    if (firstPaymentApproval) {
      const amount = parsePrice(order.total);

      if (amount === null) {
        throw errorWithStatus("Total order tidak valid", 500);
      }

      const [balanceRows] = await connection.query(
        `
            SELECT
              id_balance,
              total_amount,
              total_amount_dana,
              id_provider
            FROM balances
            WHERE id_provider = ?
            LIMIT 1
            FOR UPDATE
          `,
        [order.id_provider],
      );

      if (balanceRows.length === 0) {
        const danaAmount = order.payment_method === "DANA" ? amount : 0;

        await connection.query(
          `
            INSERT INTO balances (
              total_amount,
              total_amount_dana,
              id_provider
            )
            VALUES (?, ?, ?)
          `,
          [amount, danaAmount, order.id_provider],
        );
      } else {
        if (order.payment_method === "DANA") {
          await connection.query(
            `
              UPDATE balances
              SET
                total_amount =
                  total_amount + ?,

                total_amount_dana =
                  total_amount_dana + ?

              WHERE id_provider = ?
            `,
            [amount, amount, order.id_provider],
          );
        } else {
          await connection.query(
            `
              UPDATE balances
              SET
                total_amount =
                  total_amount + ?

              WHERE id_provider = ?
            `,
            [amount, order.id_provider],
          );
        }
      }

      balanceUpdated = true;
    }

    let healthPass = null;
    let healthPassCreated = false;

    if (finalPaymentStatus === "APPROVED" && finalOrderStatus === "APPROVED") {
      const [existingHealthPassRows] = await connection.query(
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
          WHERE id_order = ?
          LIMIT 1
        `,
        [id_order],
      );

      if (existingHealthPassRows.length > 0) {
        // Sudah pernah dibuat
        healthPass = existingHealthPassRows[0];
      } else {
        const id_health_pass = randomUUID();

        const validFrom = new Date(order.booking_at);

        if (Number.isNaN(validFrom.getTime())) {
          throw errorWithStatus("Booking date order tidak valid", 500);
        }

        const validUntil = addOneCalendarMonth(order.booking_at);

        await connection.query(
          `
            INSERT INTO health_passes (
              id_health_pass,
              status_health_pass,
              valid_from,
              valid_until,
              booking_at,
              redeemed_at,
              redeemed_by,
              id_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            id_health_pass,
            "ACTIVE",
            validFrom,
            validUntil,
            order.booking_at,
            null,
            null,
            id_order,
          ],
        );

        healthPassCreated = true;

        healthPass = {
          id_health_pass,
          status_health_pass: "ACTIVE",
          valid_from: validFrom,
          valid_until: validUntil,
          booking_at: order.booking_at,
          redeemed_at: null,
          redeemed_by: null,
          id_order,
        };
      }
    }

    await connection.commit();

    return {
      id_order,
      payment_status: finalPaymentStatus,
      order_status: finalOrderStatus,
      paid_at: finalPaidAt,
      dana_payment_id: finalDanaPaymentId,
      payment_expired_at: finalExpiredAt,
      payment_updated: true,
      balance_updated: balanceUpdated,
      health_pass_created: healthPassCreated,
      health_pass: healthPass,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}
