import { db } from "../../config/db.js";

export const DanaPaymentModel = {
  async findServiceById(idService, conn = db) {
    const [rows] = await conn.execute(
      `SELECT
           id_service,
           name_service,
           price_service,
           status_service,
           id_provider
         FROM services
         WHERE id_service = ?
         LIMIT 1`,
      [idService],
    );

    return rows[0] || null;
  },

  async createOrder(
    {
      idOrder,
      subTotal,
      total,
      bookingAt,
      paymentExpiredAt,
      idCustomer,
      idService,
    },
    conn = db,
  ) {
    await conn.execute(
      `INSERT INTO orders (
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
       VALUES (
         ?, ?, ?,
         'DANA',
         'PENDING',
         'PENDING',
         NULL,
         ?,
         NULL,
         ?,
         NOW(),
         ?,
         ?
       )`,
      [
        idOrder,
        subTotal,
        total,
        bookingAt,
        paymentExpiredAt,
        idCustomer,
        idService,
      ],
    );
  },

  async saveDanaPaymentId({ idOrder, paymentId }, conn = db) {
    await conn.execute(
      `UPDATE orders
       SET
         dana_payment_id = ?,
         payment_updated_at = NOW()
       WHERE id_order = ?`,
      [paymentId, idOrder],
    );
  },

  async findOrderById(idOrder, conn = db, lock = false) {
    let query = `
      SELECT
        o.*,
        s.name_service,
        s.price_service,
        s.id_provider
      FROM orders o
      INNER JOIN services s
        ON s.id_service = o.id_service
      WHERE o.id_order = ?
      LIMIT 1
    `;

    if (lock) {
      query += " FOR UPDATE";
    }

    const [rows] = await conn.execute(query, [idOrder]);

    return rows[0] || null;
  },

  async markOrderPaid({ idOrder, paymentId, paidAt }, conn = db) {
    await conn.execute(
      `UPDATE orders
       SET
         dana_payment_id =
           COALESCE(
             dana_payment_id,
             ?
           ),
         payment_status = 'PAID',
         order_status = 'ACTIVE',
         paid_at = ?,
         payment_updated_at = NOW()
       WHERE id_order = ?`,
      [paymentId, paidAt, idOrder],
    );
  },

  async markOrderFailed({ idOrder, paymentStatus }, conn = db) {
    await conn.execute(
      `UPDATE orders
       SET
         payment_status = ?,
         order_status = 'CANCELLED',
         payment_updated_at = NOW()
       WHERE id_order = ?
         AND payment_status = 'PENDING'`,
      [paymentStatus, idOrder],
    );
  },

  async findHealthPassByOrder(idOrder, conn = db) {
    const [rows] = await conn.execute(
      `SELECT *
         FROM health_passes
         WHERE id_order = ?
         LIMIT 1`,
      [idOrder],
    );

    return rows[0] || null;
  },

  async createHealthPass(
    { idHealthPass, validFrom, validUntil, bookingAt, idOrder },
    conn = db,
  ) {
    await conn.execute(
      `INSERT INTO health_passes (
         id_health_pass,
         status_health_pass,
         valid_from,
         valid_until,
         booking_at,
         redeemed_at,
         redeemed_by,
         id_order
       )
       VALUES (
         ?,
         'ACTIVE',
         ?,
         ?,
         ?,
         NULL,
         NULL,
         ?
       )`,
      [idHealthPass, validFrom, validUntil, bookingAt, idOrder],
    );
  },
};
