import { db } from "../../../config/db.js";

import {
  createNobuOrderId,
  nobuError,
  parseNobuPrice,
  nobuLog,
} from "../utils/nobuUtils.js";

// ============================================
// FIND ORDER
// ============================================

export const findNobuOrderById = async (orderId) => {
  const [rows] = await db.execute(
    `SELECT
       id_order,
       id_customer,
       id_guest,
       id_service,
       total,
       payment_method,
       payment_status,
       order_status,
       booking_at,
       paid_at
     FROM orders
     WHERE id_order = ?
     LIMIT 1`,
    [orderId],
  );

  return rows[0] ?? null;
};

// ============================================
// ORDER OWNERSHIP
// ============================================

export const verifyNobuOrderOwnership = async (order, customerId) => {
  if (order.id_customer != null && Number(order.id_customer) === customerId) {
    return true;
  }

  if (order.id_guest == null) {
    return false;
  }

  const [rows] = await db.execute(
    `SELECT id_guest
     FROM guests
     WHERE id_guest = ?
       AND id_customer = ?
     LIMIT 1`,
    [order.id_guest, customerId],
  );

  return rows.length > 0;
};

// ============================================
// CREATE ORDER
// ============================================

export const createNobuOrder = async ({
  customerId,
  serviceId,
  recipient,
  guestId,
  bookingAt,
}) => {
  const connection = await db.getConnection();
  let transactionActive = false;

  try {
    await connection.beginTransaction();
    transactionActive = true;

    const [services] = await connection.execute(
      `SELECT
         id_service,
         price_service,
         quota_service,
         status_service
       FROM services
       WHERE id_service = ?
       FOR UPDATE`,
      [serviceId],
    );

    const service = services[0];

    if (!service) {
      throw nobuError("Layanan tidak ditemukan", 404);
    }

    const serviceStatus = String(service.status_service ?? "").toUpperCase();

    if (!["ACTIVE", "AKTIF", "PUBLISH"].includes(serviceStatus)) {
      throw nobuError("Layanan tidak aktif");
    }

    const quota = Number(service.quota_service);

    if (!Number.isSafeInteger(quota) || quota <= 0) {
      throw nobuError("Kuota layanan tidak tersedia");
    }

    const amount = parseNobuPrice(service.price_service);

    let idCustomer = customerId;
    let idGuest = null;

    if (recipient === "GUEST") {
      const [guests] = await connection.execute(
        `SELECT id_guest
         FROM guests
         WHERE id_guest = ?
           AND id_customer = ?
         LIMIT 1`,
        [guestId, customerId],
      );

      if (!guests.length) {
        throw nobuError("Guest tidak dimiliki customer", 403);
      }

      idCustomer = null;
      idGuest = guestId;
    }

    const ownerColumn = recipient === "GUEST" ? "id_guest" : "id_customer";

    const ownerId = recipient === "GUEST" ? idGuest : idCustomer;

    const [existing] = await connection.execute(
      `SELECT id_order, payment_status
       FROM orders
       WHERE ${ownerColumn} = ?
         AND id_service = ?
         AND booking_at = ?
         AND payment_method = 'NOBU_QRIS'
         AND payment_status IN (
           'INITIATING',
           'PENDING',
           'UNKNOWN',
           'PAID'
         )
       LIMIT 1`,
      [ownerId, serviceId, bookingAt],
    );

    if (existing.length > 0) {
      throw nobuError("Transaksi QRIS untuk booking ini sudah ada", 409, {
        id_order: existing[0].id_order,
        payment_status: existing[0].payment_status,
      });
    }

    const orderId = createNobuOrderId();

    await connection.execute(
      `INSERT INTO orders (
         id_order,
         sub_total,
         total,
         payment_method,
         payment_status,
         order_status,
         booking_at,
         payment_updated_at,
         id_customer,
         id_guest,
         id_service
       )
       VALUES (
         ?, ?, ?,
         'NOBU_QRIS',
         'INITIATING',
         'INITIATING',
         ?,
         NOW(),
         ?, ?, ?
       )`,
      [
        orderId,
        String(amount),
        String(amount),
        bookingAt,
        idCustomer,
        idGuest,
        serviceId,
      ],
    );

    await connection.commit();
    transactionActive = false;

    nobuLog.info("ORDER", "Order created", {
      reference: orderId,
      customerId,
      serviceId,
      recipient,
      amount,
      paymentStatus: "INITIATING",
    });

    return {
      id_order: orderId,
      amount,
      payment_status: "INITIATING",
    };
  } catch (error) {
    if (transactionActive) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        nobuLog.error("DATABASE", "Order rollback failed", rollbackError, {
          serviceId,
        });
      }
    }

    throw error;
  } finally {
    connection.release();
  }
};

// ============================================
// UPDATE ORDER STATUS
// ============================================

export const updateNobuOrderStatus = async ({ orderId, status }) => {
  const transitions = {
    PENDING: ["INITIATING", "UNKNOWN"],
    UNKNOWN: ["INITIATING"],
    FAILED: ["INITIATING", "UNKNOWN"],
  };

  const allowedFrom = transitions[status];

  if (!allowedFrom) {
    throw new Error("Transisi status pembayaran tidak valid");
  }

  const placeholders = allowedFrom.map(() => "?").join(", ");

  const [result] = await db.execute(
    `UPDATE orders
     SET
       payment_status = ?,
       order_status = ?,
       payment_updated_at = NOW()
     WHERE id_order = ?
       AND payment_method = 'NOBU_QRIS'
       AND payment_status IN (${placeholders})`,
    [status, status, orderId, ...allowedFrom],
  );

  const current = await findNobuOrderById(orderId);

  if (!current) {
    throw nobuError("Order tidak ditemukan", 404);
  }

  if (current.payment_status !== status) {
    throw nobuError("Status order gagal diperbarui", 409, {
      id_order: orderId,
      payment_status: current.payment_status,
    });
  }

  if (result.affectedRows === 1) {
    nobuLog.info("ORDER", "Payment status updated", {
      reference: orderId,
      previousStatus:
        allowedFrom.length === 1 ? allowedFrom[0] : "INITIATING/UNKNOWN",
      currentStatus: status,
    });
  }

  return current;
};
