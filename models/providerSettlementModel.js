import { randomUUID } from "crypto";
import { db } from "../config/db.js";

// ============================================================
// HELPERS
// ============================================================

const makeError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validId = (value) =>
  /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));

const toCents = (value) => {
  const str = String(value);

  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw makeError("Nominal tidak valid", 422);
  }

  const [integer, decimals = ""] = str.split(".");

  return BigInt(integer) * 100n + BigInt(decimals.padEnd(2, "0"));
};

const fromCents = (value) =>
  `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;

const getJakartaDate = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const data = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${data.year}-${data.month}-${data.day}`;
};

// ============================================================
// SETTLEMENT CUTOFF - OPTION B
// ============================================================

// Opsi B:
// Settlement H+1 dihitung dari finished_at,
// bukan dari paid_at.
//
// Jika proses dijalankan tanggal 11 November,
// hanya Health Pass yang selesai sebelum
// 11 November pukul 00:00:00 WIB
// yang memenuhi syarat.
//
// Asumsi: nilai DATETIME database disimpan
// sesuai waktu Asia/Jakarta.

export const getSettlementCutoff = () => `${getJakartaDate()} 00:00:00`;

// ============================================================
// GET ALL SETTLEMENTS
// ============================================================

export async function getAllSettlements() {
  const [rows] = await db.query(`
    SELECT
      ps.*,
      p.name_provider,
      pba.bank_name,
      RIGHT(pba.account_number, 4)
        AS account_last_four

    FROM provider_settlements ps

    INNER JOIN providers p
      ON p.id_provider = ps.id_provider

    INNER JOIN provider_bank_accounts pba
      ON pba.id_provider_bank_account =
         ps.id_provider_bank_account

    ORDER BY
      ps.id_provider_settlement DESC

    LIMIT 200
  `);

  return rows;
}

// ============================================================
// GET SETTLEMENT BY ID
// ============================================================

export async function getSettlementById(id) {
  if (!validId(id)) {
    throw makeError("ID settlement tidak valid");
  }

  const [rows] = await db.query(
    `
      SELECT
        ps.*,
        p.name_provider,
        pba.bank_name,
        RIGHT(pba.account_number, 4)
          AS account_last_four

      FROM provider_settlements ps

      INNER JOIN providers p
        ON p.id_provider = ps.id_provider

      INNER JOIN provider_bank_accounts pba
        ON pba.id_provider_bank_account =
           ps.id_provider_bank_account

      WHERE ps.id_provider_settlement = ?

      LIMIT 1
    `,
    [Number(id)],
  );

  return rows[0] || null;
}

// ============================================================
// GET ORDERS BY SETTLEMENT
// ============================================================

export async function getSettlementOrders(id) {
  if (!validId(id)) {
    throw makeError("ID settlement tidak valid");
  }

  const [rows] = await db.query(
    `
      SELECT
        o.id_order,
        o.total,
        o.payment_method,
        o.payment_status,
        o.order_status,
        o.paid_at,
        o.booking_at,
        o.id_service,

        (
          SELECT MAX(hp.finished_at)
          FROM health_passes hp
          WHERE hp.id_order = o.id_order
        ) AS completed_at

      FROM orders o

      WHERE o.id_provider_settlement = ?

      ORDER BY o.paid_at ASC
    `,
    [Number(id)],
  );

  return rows;
}

// ============================================================
// GET ELIGIBLE PROVIDERS - OPTION B
// ============================================================

// Provider baru dianggap memiliki order eligible
// apabila:
//
// 1. Payment method DANA.
// 2. Payment APPROVED.
// 3. Order APPROVED.
// 4. Pembayaran telah tercatat.
// 5. Order belum masuk settlement.
// 6. Minimal satu Health Pass tersedia.
// 7. Seluruh Health Pass sudah FINISHED.
// 8. Semua finished_at sebelum cutoff H+1.
// 9. Rekening provider aktif dan verified.

export async function getEligibleProviderIds() {
  const cutoff = getSettlementCutoff();

  const [rows] = await db.query(
    `
      SELECT DISTINCT
        s.id_provider

      FROM orders o

      INNER JOIN services s
        ON s.id_service = o.id_service

      INNER JOIN provider_bank_accounts pba
        ON pba.id_provider = s.id_provider

      WHERE
        o.payment_method = 'DANA'

        AND o.payment_status = 'APPROVED'

        AND o.order_status = 'APPROVED'

        AND o.paid_at IS NOT NULL

        AND o.id_provider_settlement IS NULL

        -- Minimal ada satu Health Pass.
        AND EXISTS (
          SELECT 1
          FROM health_passes hp
          WHERE hp.id_order = o.id_order
        )

        -- Tidak boleh ada Health Pass yang
        -- belum selesai atau belum melewati
        -- cutoff H+1.
        AND NOT EXISTS (
          SELECT 1

          FROM health_passes hp

          WHERE hp.id_order = o.id_order

            AND (
              hp.status_health_pass <> 'FINISHED'

              OR hp.finished_at IS NULL

              OR hp.finished_at >= ?
            )
        )

        AND pba.is_active = 'TRUE'

        AND pba.verification_status = 'VERIFIED'

      ORDER BY s.id_provider
    `,
    [cutoff],
  );

  return rows.map((row) => Number(row.id_provider));
}

// ============================================================
// CREATE SETTLEMENT FOR ONE PROVIDER
// ============================================================

export async function createSettlementForProvider(providerId) {
  if (!validId(providerId)) {
    throw makeError("ID provider tidak valid");
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ========================================================
    // LOCK PROVIDER
    // ========================================================

    // Serialisasi proses pembuatan settlement
    // per provider agar dua worker tidak
    // membuat batch untuk order yang sama.

    const [providers] = await connection.query(
      `
          SELECT id_provider

          FROM providers

          WHERE id_provider = ?

          LIMIT 1

          FOR UPDATE
        `,
      [Number(providerId)],
    );

    if (!providers.length) {
      throw makeError("Provider tidak ditemukan", 404);
    }

    // ========================================================
    // VALIDATE BANK ACCOUNT
    // ========================================================

    const [accounts] = await connection.query(
      `
          SELECT
            id_provider_bank_account

          FROM provider_bank_accounts

          WHERE id_provider = ?

            AND is_active = 'TRUE'

            AND verification_status = 'VERIFIED'

          FOR UPDATE
        `,
      [Number(providerId)],
    );

    // Harus tepat satu rekening aktif
    // dan terverifikasi.

    if (accounts.length !== 1) {
      await connection.rollback();
      return null;
    }

    // ========================================================
    // GET SETTLEMENT CUTOFF
    // ========================================================

    const cutoff = getSettlementCutoff();

    // ========================================================
    // GET ELIGIBLE ORDERS
    // ========================================================

    const [orders] = await connection.query(
      `
          SELECT
            o.id_order,
            o.total,
            o.paid_at,

            (
              SELECT MAX(hp.finished_at)

              FROM health_passes hp

              WHERE hp.id_order = o.id_order
            ) AS completed_at

          FROM orders o

          INNER JOIN services s
            ON s.id_service = o.id_service

          WHERE s.id_provider = ?

            AND o.payment_method = 'DANA'

            AND o.payment_status = 'APPROVED'

            AND o.order_status = 'APPROVED'

            AND o.paid_at IS NOT NULL

            AND o.id_provider_settlement IS NULL

            -- Wajib memiliki Health Pass.
            AND EXISTS (
              SELECT 1

              FROM health_passes hp

              WHERE hp.id_order = o.id_order
            )

            -- Seluruh Health Pass harus
            -- selesai sebelum cutoff.
            AND NOT EXISTS (
              SELECT 1

              FROM health_passes hp

              WHERE hp.id_order = o.id_order

                AND (
                  hp.status_health_pass
                    <> 'FINISHED'

                  OR hp.finished_at IS NULL

                  OR hp.finished_at >= ?
                )
            )

          ORDER BY
            completed_at,
            o.id_order

          FOR UPDATE
        `,
      [Number(providerId), cutoff],
    );

    if (!orders.length) {
      await connection.rollback();
      return null;
    }

    // ========================================================
    // CALCULATE SETTLEMENT AMOUNT
    // ========================================================

    let grossCents = 0n;

    for (const order of orders) {
      const amount = toCents(order.total);

      if (amount <= 0n) {
        throw makeError(`Nominal order ${order.id_order} tidak valid`, 422);
      }

      grossCents += amount;
    }

    const grossAmount = fromCents(grossCents);

    if (grossAmount.split(".")[0].length > 13) {
      throw makeError(
        "Nominal settlement melebihi kapasitas DECIMAL(15,2)",
        422,
      );
    }

    // ========================================================
    // SETTLEMENT REFERENCE
    // ========================================================

    const settlementReference = `STQ${randomUUID().replace(/-/g, "")}`;

    // ========================================================
    // PLATFORM FEE
    // ========================================================

    // Komisi platform belum ditetapkan.
    // Saat ini seluruh gross dibayarkan
    // kepada provider.

    const platformFee = "0.00";

    const netAmount = grossAmount;

    // ========================================================
    // CREATE SETTLEMENT BATCH
    // ========================================================

    // Period start menggunakan completion_at
    // dari order pertama (urut paling awal).
    //
    // Period end menggunakan cutoff H+1.

    const periodStart = orders[0].completed_at;

    const periodEnd = cutoff;

    const [created] = await connection.query(
      `
          INSERT INTO provider_settlements (
            settlement_reference,
            payout_reference,
            settlement_date,
            period_start,
            period_end,
            order_count,
            gross_amount,
            platform_fee,
            net_amount,
            status,
            id_provider_bank_account,
            id_provider
          )

          VALUES (
            ?,
            NULL,
            NOW(),
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'PENDING',
            ?,
            ?
          )
        `,
      [
        settlementReference,
        periodStart,
        periodEnd,
        orders.length,
        grossAmount,
        platformFee,
        netAmount,
        accounts[0].id_provider_bank_account,
        Number(providerId),
      ],
    );

    // ========================================================
    // LINK ORDERS TO SETTLEMENT
    // ========================================================

    const orderIds = orders.map((order) => order.id_order);

    const [linked] = await connection.query(
      `
          UPDATE orders

          SET
            id_provider_settlement = ?

          WHERE id_order IN (?)

            AND id_provider_settlement IS NULL
        `,
      [created.insertId, orderIds],
    );

    // Semua order harus berhasil dialokasikan.

    if (linked.affectedRows !== orders.length) {
      throw makeError("Order sudah dialokasikan ke settlement lain", 409);
    }

    // ========================================================
    // COMMIT
    // ========================================================

    await connection.commit();

    return {
      id_provider_settlement: created.insertId,

      settlement_reference: settlementReference,

      id_provider: Number(providerId),

      order_count: orders.length,

      gross_amount: grossAmount,

      platform_fee: platformFee,

      net_amount: netAmount,

      status: "PENDING",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ============================================================
// GENERATE ALL ELIGIBLE SETTLEMENTS
// ============================================================

export async function generateAllSettlements() {
  const providerIds = await getEligibleProviderIds();

  const created = [];
  const errors = [];

  for (const providerId of providerIds) {
    try {
      const settlement = await createSettlementForProvider(providerId);

      if (settlement) {
        created.push(settlement);
      }
    } catch (error) {
      errors.push({
        id_provider: providerId,
        message: error.message,
      });
    }
  }

  return {
    created,
    errors,
  };
}

// ============================================================
// CLAIM SETTLEMENT FOR PAYOUT
// ============================================================

// Pemeriksaan tambahan untuk batch PENDING.
//
// Penting karena batch yang dibuat menggunakan
// aturan lama (H+1 pembayaran) mungkin masih
// tersimpan di database.
//
// Batch tersebut tidak boleh langsung dikirim
// apabila treatment belum FINISHED.

export async function claimSettlement(id) {
  if (!validId(id)) {
    throw makeError("ID settlement tidak valid");
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ========================================================
    // LOCK SETTLEMENT
    // ========================================================

    const [batchRows] = await connection.query(
      `
          SELECT
            id_provider_settlement,
            status

          FROM provider_settlements

          WHERE id_provider_settlement = ?

          FOR UPDATE
        `,
      [Number(id)],
    );

    if (!batchRows.length || batchRows[0].status !== "PENDING") {
      await connection.rollback();
      return false;
    }

    // ========================================================
    // REVALIDATE ORDERS
    // ========================================================

    const [checkRows] = await connection.query(
      `
          SELECT
            COUNT(*) AS order_count,

            SUM(
              CASE
                WHEN
                  o.payment_method = 'DANA'

                  AND o.payment_status = 'APPROVED'

                  AND o.order_status = 'APPROVED'

                  AND o.paid_at IS NOT NULL

                  AND s.id_provider = ps.id_provider

                  AND EXISTS (
                    SELECT 1

                    FROM health_passes hp

                    WHERE hp.id_order = o.id_order
                  )

                  AND NOT EXISTS (
                    SELECT 1

                    FROM health_passes hp

                    WHERE hp.id_order = o.id_order

                      AND (
                        hp.status_health_pass
                          <> 'FINISHED'

                        OR hp.finished_at IS NULL

                        OR hp.finished_at >= ?
                      )
                  )

                THEN 1

                ELSE 0
              END
            ) AS eligible_count

          FROM provider_settlements ps

          LEFT JOIN orders o
            ON o.id_provider_settlement =
               ps.id_provider_settlement

          LEFT JOIN services s
            ON s.id_service = o.id_service

          WHERE ps.id_provider_settlement = ?

          GROUP BY
            ps.id_provider_settlement
        `,
      [getSettlementCutoff(), Number(id)],
    );

    const check = checkRows[0];

    const valid =
      check &&
      Number(check.order_count) > 0 &&
      Number(check.order_count) === Number(check.eligible_count);

    // ========================================================
    // INVALID LEGACY BATCH
    // ========================================================

    if (!valid) {
      await connection.query(
        `
          UPDATE provider_settlements

          SET status = 'REVIEW'

          WHERE id_provider_settlement = ?

            AND status = 'PENDING'
        `,
        [Number(id)],
      );

      await connection.commit();

      console.warn(
        "[SETTLEMENT] Batch tidak eligible Opsi B, ditandai REVIEW:",
        id,
      );

      return false;
    }

    // ========================================================
    // CLAIM FOR TRANSFER
    // ========================================================

    const [updated] = await connection.query(
      `
          UPDATE provider_settlements

          SET status = 'PROCESSING'

          WHERE id_provider_settlement = ?

            AND status = 'PENDING'
        `,
      [Number(id)],
    );

    await connection.commit();

    return updated.affectedRows === 1;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ============================================================
// GET PAYOUT DATA
// ============================================================

export async function getPayoutData(id) {
  if (!validId(id)) {
    throw makeError("ID settlement tidak valid");
  }

  const [rows] = await db.query(
    `
      SELECT
        ps.id_provider_settlement,
        ps.settlement_reference,
        ps.payout_reference,
        ps.net_amount,
        ps.status,
        ps.id_provider,

        pba.bank_code,
        pba.bank_name,
        pba.account_number,
        pba.account_holder_name,
        pba.is_active,
        pba.verification_status

      FROM provider_settlements ps

      INNER JOIN provider_bank_accounts pba
        ON pba.id_provider_bank_account =
           ps.id_provider_bank_account

       AND pba.id_provider = ps.id_provider

      WHERE ps.id_provider_settlement = ?

      LIMIT 1
    `,
    [Number(id)],
  );

  if (!rows.length) {
    throw makeError("Settlement tidak ditemukan", 404);
  }

  const payout = rows[0];

  if (
    payout.is_active !== "TRUE" ||
    payout.verification_status !== "VERIFIED"
  ) {
    throw makeError("Rekening provider belum aktif atau terverifikasi", 409);
  }

  return payout;
}

// ============================================================
// RECONCILIATION DATA
// ============================================================

export async function getReconciliationPayoutData(id) {
  if (!validId(id)) {
    throw makeError("ID settlement tidak valid");
  }

  const [rows] = await db.query(
    `
      SELECT
        id_provider_settlement,
        settlement_reference,
        payout_reference,
        net_amount,
        id_provider,
        status

      FROM provider_settlements

      WHERE id_provider_settlement = ?

        AND status IN (
          'PROCESSING',
          'SUBMITTED',
          'REVIEW'
        )

      LIMIT 1
    `,
    [Number(id)],
  );

  return rows[0] || null;
}

// ============================================================
// MARK TRANSFER SUBMITTED
// ============================================================

export async function markSubmitted(id, payoutReference = null) {
  const [result] = await db.query(
    `
      UPDATE provider_settlements

      SET
        status = 'SUBMITTED',

        payout_reference =
          COALESCE(
            ?,
            payout_reference
          )

      WHERE id_provider_settlement = ?

        AND status = 'PROCESSING'
    `,
    [payoutReference, Number(id)],
  );

  return result.affectedRows === 1;
}

// ============================================================
// MARK REVIEW
// ============================================================

export async function markReview(id) {
  const [result] = await db.query(
    `
      UPDATE provider_settlements

      SET status = 'REVIEW'

      WHERE id_provider_settlement = ?

        AND status IN (
          'PROCESSING',
          'SUBMITTED'
        )
    `,
    [Number(id)],
  );

  return result.affectedRows === 1;
}

// ============================================================
// GET RECONCILIATION QUEUE
// ============================================================

export async function getReconciliationQueue() {
  const [rows] = await db.query(
    `
      SELECT
        id_provider_settlement

      FROM provider_settlements

      WHERE status IN (
        'PROCESSING',
        'SUBMITTED',
        'REVIEW'
      )

      ORDER BY settlement_date ASC

      LIMIT 100
    `,
  );

  return rows.map((row) => Number(row.id_provider_settlement));
}

// ============================================================
// FINALIZE SUCCESS
// ============================================================

export async function finalizeSuccess(id, payoutReference = null) {
  if (!validId(id)) {
    throw makeError("ID settlement tidak valid");
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ========================================================
    // LOCK SETTLEMENT
    // ========================================================

    const [rows] = await connection.query(
      `
          SELECT
            id_provider_settlement,
            id_provider,
            net_amount,
            status

          FROM provider_settlements

          WHERE id_provider_settlement = ?

          LIMIT 1

          FOR UPDATE
        `,
      [Number(id)],
    );

    if (!rows.length) {
      throw makeError("Settlement tidak ditemukan", 404);
    }

    const settlement = rows[0];

    // ========================================================
    // IDEMPOTENCY
    // ========================================================

    // Inquiry yang sama tidak boleh
    // mengurangi saldo dua kali.

    if (settlement.status === "SUCCESS") {
      await connection.commit();

      return {
        already_processed: true,
        status: "SUCCESS",
      };
    }

    if (!["PROCESSING", "SUBMITTED", "REVIEW"].includes(settlement.status)) {
      throw makeError("Status settlement tidak dapat difinalisasi", 409);
    }

    // ========================================================
    // DECREASE PROVIDER DANA BALANCE
    // ========================================================

    // Saldo hanya dikurangi setelah inquiry
    // mengonfirmasi transfer SUCCESS.
    //
    // Tidak mengurangi saldo saat batch
    // baru dibuat atau transfer SUBMITTED.

    const [balanceResult] = await connection.query(
      `
          UPDATE balances

          SET total_amount_dana =
            total_amount_dana - ?

          WHERE id_provider = ?

            AND total_amount_dana >= ?
        `,
      [settlement.net_amount, settlement.id_provider, settlement.net_amount],
    );

    if (balanceResult.affectedRows !== 1) {
      throw makeError(
        "Saldo DANA tidak mencukupi atau data saldo tidak ditemukan. Perlu rekonsiliasi.",
        409,
      );
    }

    // ========================================================
    // UPDATE SETTLEMENT STATUS
    // ========================================================

    const [updated] = await connection.query(
      `
          UPDATE provider_settlements

          SET
            status = 'SUCCESS',

            payout_reference =
              COALESCE(
                ?,
                payout_reference
              )

          WHERE id_provider_settlement = ?

            AND status IN (
              'PROCESSING',
              'SUBMITTED',
              'REVIEW'
            )
        `,
      [payoutReference, Number(id)],
    );

    if (updated.affectedRows !== 1) {
      throw makeError("Gagal memperbarui status settlement", 409);
    }

    // ========================================================
    // COMMIT
    // ========================================================

    await connection.commit();

    return {
      already_processed: false,

      id_provider_settlement: Number(id),

      status: "SUCCESS",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
