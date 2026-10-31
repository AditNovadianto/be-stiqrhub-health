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

const isPositiveId = (value) =>
  /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));

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
  id_guest = null,
  id_customer_buyer = null,
) {
  const hasCustomer = id_customer !== null && id_customer !== undefined;

  const hasGuest = id_guest !== null && id_guest !== undefined;

  if (hasCustomer === hasGuest) {
    throw errorWithStatus(
      "Pilih tepat satu penerima: customer atau guest",
      400,
    );
  }

  if (hasCustomer && !isPositiveId(id_customer)) {
    throw errorWithStatus("ID customer tidak valid", 400);
  }

  if (hasGuest && !isPositiveId(id_guest)) {
    throw errorWithStatus("ID guest tidak valid", 400);
  }

  if (!isPositiveId(id_customer_buyer)) {
    throw errorWithStatus("Customer pembeli tidak valid", 401);
  }

  if (hasCustomer && Number(id_customer) !== Number(id_customer_buyer)) {
    throw errorWithStatus("ID customer tidak sesuai akun login", 403);
  }

  if (!isPositiveId(id_service)) {
    throw errorWithStatus("ID service tidak valid", 400);
  }

  if (typeof payment_method !== "string" || !payment_method.trim()) {
    throw errorWithStatus("Payment method wajib diisi", 400);
  }

  const normalizedPaymentMethod = payment_method.trim().toUpperCase();

  const bookingDate = new Date(booking_at);

  if (Number.isNaN(bookingDate.getTime()) || bookingDate <= new Date()) {
    throw errorWithStatus("Booking date harus valid dan di masa depan", 400);
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    if (hasCustomer) {
      const [customerRows] = await connection.query(
        `
          SELECT id_customer
          FROM customers
          WHERE id_customer = ?
          LIMIT 1
          FOR UPDATE
        `,
        [Number(id_customer)],
      );

      if (customerRows.length === 0) {
        throw errorWithStatus("Customer tidak ditemukan", 404);
      }
    } else {
      const [guestRows] = await connection.query(
        `
          SELECT
            id_guest,
            id_customer
          FROM guests
          WHERE id_guest = ?
          LIMIT 1
          FOR UPDATE
        `,
        [Number(id_guest)],
      );

      if (guestRows.length === 0) {
        throw errorWithStatus("Guest tidak ditemukan", 404);
      }

      if (
        guestRows[0].id_customer == null ||
        Number(guestRows[0].id_customer) !== Number(id_customer_buyer)
      ) {
        throw errorWithStatus("Guest bukan milik customer ini", 403);
      }
    }

    const [serviceRows] = await connection.query(
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
        FOR UPDATE
      `,
      [Number(id_service)],
    );

    if (serviceRows.length === 0) {
      throw errorWithStatus("Service tidak ditemukan", 404);
    }

    const service = serviceRows[0];

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

    const recipientWhere = hasCustomer ? "o.id_customer = ?" : "o.id_guest = ?";

    const recipientId = hasCustomer ? Number(id_customer) : Number(id_guest);

    const [existingHealthPassRows] = await connection.query(
      `
          SELECT hp.id_health_pass
          FROM health_passes hp
          INNER JOIN orders o
            ON hp.id_order = o.id_order
          WHERE ${recipientWhere}
            AND o.id_service = ?
            AND hp.booking_at = ?
            AND hp.status_health_pass = 'ACTIVE'
          LIMIT 1
        `,
      [recipientId, Number(id_service), booking_at],
    );

    if (existingHealthPassRows.length > 0) {
      throw errorWithStatus(
        "Penerima sudah memiliki Health Pass aktif untuk layanan dan jadwal tersebut",
        409,
      );
    }

    const [pendingOrderRows] = await connection.query(
      `
        SELECT o.id_order
        FROM orders o
        WHERE ${recipientWhere}
          AND o.id_service = ?
          AND o.booking_at = ?
          AND o.payment_status = 'PENDING'
          AND o.order_status = 'PENDING'
        LIMIT 1
      `,
      [recipientId, Number(id_service), booking_at],
    );

    if (pendingOrderRows.length > 0) {
      throw errorWithStatus(
        "Penerima masih memiliki pembayaran yang belum selesai untuk layanan dan jadwal tersebut",
        409,
      );
    }

    const id_order = randomUUID();
    const sub_total = String(price);
    const total = String(price);

    const [result] = await connection.query(
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
          id_guest,
          id_service
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id_order,
        sub_total,
        total,
        normalizedPaymentMethod,
        "PENDING",
        "PENDING",
        null,
        booking_at,
        null,
        null,
        null,
        hasCustomer ? Number(id_customer) : null,
        hasGuest ? Number(id_guest) : null,
        Number(id_service),
      ],
    );

    if (result.affectedRows !== 1) {
      throw errorWithStatus("Order gagal dibuat", 500);
    }

    await connection.commit();

    return id_order;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
        o.id_provider_settlement,

        o.id_customer,
        c.name_customer,
        c.email_customer,
        c.phone_number_customer,

        o.id_guest,
        g.name_guest,
        g.email_guest,
        g.phone_number_guest,

        CASE
          WHEN o.id_guest IS NOT NULL
          THEN 'GUEST'
          ELSE 'CUSTOMER'
        END AS recipient_type,

        COALESCE(
          g.name_guest,
          c.name_customer
        ) AS recipient_name,

        COALESCE(
          g.email_guest,
          c.email_customer
        ) AS recipient_email,

        COALESCE(
          g.phone_number_guest,
          c.phone_number_customer
        ) AS recipient_phone,

        o.id_service,
        s.name_service,
        s.price_service,
        s.image_service,

        s.id_provider,
        p.name_provider

      FROM orders o

      LEFT JOIN customers c
        ON o.id_customer = c.id_customer

      LEFT JOIN guests g
        ON o.id_guest = g.id_guest

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
        o.id_provider_settlement,

        o.id_customer,
        c.name_customer,
        c.email_customer,
        c.phone_number_customer,

        o.id_guest,
        g.name_guest,
        g.email_guest,
        g.phone_number_guest,

        CASE
          WHEN o.id_guest IS NOT NULL
          THEN 'GUEST'
          ELSE 'CUSTOMER'
        END AS recipient_type,

        COALESCE(
          g.name_guest,
          c.name_customer
        ) AS recipient_name,

        COALESCE(
          g.email_guest,
          c.email_customer
        ) AS recipient_email,

        COALESCE(
          g.phone_number_guest,
          c.phone_number_customer
        ) AS recipient_phone,

        o.id_service,
        s.name_service,
        s.price_service,
        s.image_service,
        s.description_service,
        s.maps_service,

        s.id_provider,
        p.name_provider

      FROM orders o

      LEFT JOIN customers c
        ON o.id_customer = c.id_customer

      LEFT JOIN guests g
        ON o.id_guest = g.id_guest

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
        o.id_provider_settlement,

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
        o.id_provider_settlement,

        o.id_customer,
        c.name_customer,
        c.email_customer,
        c.phone_number_customer,

        o.id_guest,
        g.name_guest,
        g.email_guest,
        g.phone_number_guest,

        CASE
          WHEN o.id_guest IS NOT NULL
          THEN 'GUEST'
          ELSE 'CUSTOMER'
        END AS recipient_type,

        COALESCE(
          g.name_guest,
          c.name_customer
        ) AS recipient_name,

        COALESCE(
          g.email_guest,
          c.email_customer
        ) AS recipient_email,

        COALESCE(
          g.phone_number_guest,
          c.phone_number_customer
        ) AS recipient_phone,

        o.id_service,
        s.name_service,
        s.price_service,
        s.image_service,

        s.id_provider,
        p.name_provider

      FROM orders o

      LEFT JOIN customers c
        ON o.id_customer = c.id_customer

      LEFT JOIN guests g
        ON o.id_guest = g.id_guest

      INNER JOIN services s
        ON o.id_service = s.id_service

      INNER JOIN providers p
        ON s.id_provider = p.id_provider

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
      if (paid_at) {
        finalPaidAt = paid_at instanceof Date ? paid_at : new Date(paid_at);

        if (Number.isNaN(finalPaidAt.getTime())) {
          throw errorWithStatus("Tanggal pembayaran tidak valid", 500);
        }
      } else {
        finalPaidAt = new Date();
      }
    }

    const finalDanaPaymentId = dana_payment_id || order.dana_payment_id || null;

    let finalExpiredAt = payment_expired_at || order.payment_expired_at || null;

    if (finalExpiredAt && !(finalExpiredAt instanceof Date)) {
      const normalizedExpiredAt = new Date(finalExpiredAt);

      if (Number.isNaN(normalizedExpiredAt.getTime())) {
        throw errorWithStatus("Tanggal expired pembayaran tidak valid", 500);
      }

      finalExpiredAt = normalizedExpiredAt;
    }

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

    const firstPaymentApproval =
      previousPaymentStatus !== "APPROVED" && finalPaymentStatus === "APPROVED";

    let balanceUpdated = false;

    let quotaUpdated = false;

    if (firstPaymentApproval) {
      const amount = parsePrice(order.total);

      if (amount === null) {
        throw errorWithStatus("Total order tidak valid", 500);
      }

      const paymentMethod = String(order.payment_method || "")
        .trim()
        .toUpperCase();

      const [quotaResult] = await connection.query(
        `
            UPDATE services
            SET
              quota_service =
                quota_service - 1
            WHERE id_service = ?
              AND quota_service > 0
          `,
        [order.id_service],
      );

      if (quotaResult.affectedRows === 0) {
        throw errorWithStatus("Quota service sudah habis", 409);
      }

      quotaUpdated = true;

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
        let totalAmount = 0;

        let totalAmountDana = 0;

        if (paymentMethod === "DANA") {
          totalAmountDana = amount;
        } else {
          totalAmount = amount;
        }

        await connection.query(
          `
            INSERT INTO balances (
              total_amount,
              total_amount_dana,
              id_provider
            )
            VALUES (?, ?, ?)
          `,
          [totalAmount, totalAmountDana, order.id_provider],
        );

        balanceUpdated = true;
      } else {
        if (paymentMethod === "DANA") {
          await connection.query(
            `
              UPDATE balances
              SET
                total_amount_dana =
                  total_amount_dana + ?
              WHERE id_provider = ?
            `,
            [amount, order.id_provider],
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

        balanceUpdated = true;
      }
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
        healthPass = existingHealthPassRows[0];
      } else {
        const id_health_pass = randomUUID();

        const validFrom = new Date(order.booking_at);

        if (Number.isNaN(validFrom.getTime())) {
          throw errorWithStatus("Booking date order tidak valid", 500);
        }

        const validUntil = addOneCalendarMonth(order.booking_at);

        if (!validUntil || Number.isNaN(new Date(validUntil).getTime())) {
          throw errorWithStatus(
            "Tanggal valid until health pass tidak valid",
            500,
          );
        }

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
      quota_updated: quotaUpdated,
      balance_updated: balanceUpdated,

      health_pass_created: healthPassCreated,
      health_pass: healthPass,

      // Digunakan callback DANA untuk memicu email sekali.
      first_payment_approval: firstPaymentApproval,

      notification_required:
        firstPaymentApproval &&
        finalPaymentStatus === "APPROVED" &&
        finalOrderStatus === "APPROVED" &&
        healthPass !== null,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}
