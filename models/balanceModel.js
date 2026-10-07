import { db } from "../config/db.js";

// HELPERS
const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
};

const parseAmount = (value) => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return amount;
};

// GET ALL BALANCES
export async function getAllBalances() {
  const [rows] = await db.query(
    `
        SELECT
          b.id_balance,
          b.total_amount,
          b.total_amount_dana,
          b.id_provider,

          p.name_provider,
          p.status_provider

        FROM balances b

        INNER JOIN providers p
          ON b.id_provider =
             p.id_provider

        ORDER BY
          b.id_balance DESC
      `,
  );

  return rows.map((row) => {
    const totalAmount = parseAmount(row.total_amount);

    const totalAmountDana = parseAmount(row.total_amount_dana);

    return {
      ...row,

      total_amount: totalAmount,

      total_amount_dana: totalAmountDana,

      total_balance: totalAmount + totalAmountDana,
    };
  });
}

// GET BALANCE BY ID
export async function getBalanceById(id_balance) {
  const [rows] = await db.query(
    `
        SELECT
          b.id_balance,
          b.total_amount,
          b.total_amount_dana,
          b.id_provider,

          p.name_provider,
          p.status_provider

        FROM balances b

        INNER JOIN providers p
          ON b.id_provider =
             p.id_provider

        WHERE b.id_balance = ?

        LIMIT 1
      `,
    [id_balance],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  const totalAmount = parseAmount(row.total_amount);

  const totalAmountDana = parseAmount(row.total_amount_dana);

  return {
    ...row,

    total_amount: totalAmount,

    total_amount_dana: totalAmountDana,

    total_balance: totalAmount + totalAmountDana,
  };
}

// GET BALANCE BY PROVIDER
export async function getBalanceByProvider(id_provider) {
  const [rows] = await db.query(
    `
        SELECT
          b.id_balance,
          b.total_amount,
          b.total_amount_dana,
          b.id_provider,

          p.name_provider,
          p.status_provider

        FROM balances b

        INNER JOIN providers p
          ON b.id_provider =
             p.id_provider

        WHERE b.id_provider = ?

        LIMIT 1
      `,
    [id_provider],
  );

  if (rows.length === 0) {
    return {
      id_balance: null,

      id_provider: Number(id_provider),

      total_amount: 0,

      total_amount_dana: 0,

      total_balance: 0,
    };
  }

  const row = rows[0];

  const totalAmount = parseAmount(row.total_amount);

  const totalAmountDana = parseAmount(row.total_amount_dana);

  return {
    ...row,

    total_amount: totalAmount,

    total_amount_dana: totalAmountDana,

    total_balance: totalAmount + totalAmountDana,
  };
}

// GET PROVIDER BALANCE SUMMARY
//
// Mengambil balance + statistik order APPROVED.
// Cocok untuk dashboard provider.
export async function getProviderBalanceSummary(id_provider) {
  const balance = await getBalanceByProvider(id_provider);

  const [summaryRows] = await db.query(
    `
        SELECT
          COUNT(o.id_order)
            AS total_success_orders,

          COALESCE(
            SUM(
              CASE
                WHEN UPPER(
                  TRIM(
                    o.payment_method
                  )
                ) = 'DANA'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS total_dana_orders,

          COALESCE(
            SUM(
              CASE
                WHEN UPPER(
                  TRIM(
                    o.payment_method
                  )
                ) <> 'DANA'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS total_non_dana_orders

        FROM orders o

        INNER JOIN services s
          ON o.id_service =
             s.id_service

        WHERE s.id_provider = ?
          AND o.payment_status =
              'APPROVED'
          AND o.order_status =
              'APPROVED'
      `,
    [id_provider],
  );

  const summary = summaryRows[0] || {};

  return {
    ...balance,

    total_success_orders: Number(summary.total_success_orders || 0),

    total_dana_orders: Number(summary.total_dana_orders || 0),

    total_non_dana_orders: Number(summary.total_non_dana_orders || 0),
  };
}

// GET GLOBAL SUMMARY
//
// Internal/admin use.
export async function getBalanceSummary() {
  const [rows] = await db.query(
    `
        SELECT
          COUNT(*)
            AS total_provider_balances,

          COALESCE(
            SUM(total_amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(total_amount_dana),
            0
          ) AS total_amount_dana

        FROM balances
      `,
  );

  const row = rows[0] || {};

  const totalAmount = parseAmount(row.total_amount);

  const totalAmountDana = parseAmount(row.total_amount_dana);

  return {
    total_provider_balances: Number(row.total_provider_balances || 0),

    total_amount: totalAmount,

    total_amount_dana: totalAmountDana,

    total_balance: totalAmount + totalAmountDana,
  };
}

// VALIDATE PROVIDER
export async function ensureProviderExists(id_provider) {
  const [rows] = await db.query(
    `
        SELECT
          id_provider,
          name_provider,
          status_provider

        FROM providers

        WHERE id_provider = ?

        LIMIT 1
      `,
    [id_provider],
  );

  if (rows.length === 0) {
    throw errorWithStatus("Provider tidak ditemukan", 404);
  }

  return rows[0];
}
