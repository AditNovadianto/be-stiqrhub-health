import { db } from "../config/db.js";

// HELPERS
const makeError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// GET ALL BANK ACCOUNTS
export async function getAllBankAccounts() {
  const [rows] = await db.query(
    `
      SELECT
        pba.id_provider_bank_account,
        pba.bank_code,
        pba.bank_name,
        pba.account_number,
        pba.account_holder_name,
        pba.is_active,
        pba.verification_status,
        pba.id_provider,
        p.name_provider
      FROM provider_bank_accounts pba
      INNER JOIN providers p
        ON pba.id_provider = p.id_provider
      ORDER BY pba.id_provider_bank_account DESC
    `,
  );

  return rows;
}

// GET BANK ACCOUNT BY ID
export async function getBankAccountById(bankAccountId) {
  const [rows] = await db.query(
    `
      SELECT
        pba.id_provider_bank_account,
        pba.bank_code,
        pba.bank_name,
        pba.account_number,
        pba.account_holder_name,
        pba.is_active,
        pba.verification_status,
        pba.id_provider,
        p.name_provider
      FROM provider_bank_accounts pba
      INNER JOIN providers p
        ON pba.id_provider = p.id_provider
      WHERE pba.id_provider_bank_account = ?
      LIMIT 1
    `,
    [bankAccountId],
  );

  return rows[0] || null;
}

// GET BANK ACCOUNT BY PROVIDER
export async function getBankAccountByProvider(providerId) {
  const [rows] = await db.query(
    `
      SELECT
        pba.id_provider_bank_account,
        pba.bank_code,
        pba.bank_name,
        pba.account_number,
        pba.account_holder_name,
        pba.is_active,
        pba.verification_status,
        pba.id_provider,
        p.name_provider
      FROM provider_bank_accounts pba
      INNER JOIN providers p
        ON pba.id_provider = p.id_provider
      WHERE pba.id_provider = ?
      ORDER BY pba.id_provider_bank_account ASC
      LIMIT 2
    `,
    [providerId],
  );

  if (rows.length > 1) {
    throw makeError(
      "Provider memiliki lebih dari satu rekening bank. Hubungi administrator.",
      409,
    );
  }

  return rows[0] || null;
}

// CREATE BANK ACCOUNT
export async function createBankAccount(data) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Kunci record provider supaya request create
    // melalui fungsi ini diproses secara berurutan.
    const [providers] = await connection.query(
      `
        SELECT id_provider
        FROM providers
        WHERE id_provider = ?
        LIMIT 1
        FOR UPDATE
      `,
      [data.id_provider],
    );

    if (providers.length === 0) {
      throw makeError("Provider tidak ditemukan", 404);
    }

    const [existingAccounts] = await connection.query(
      `
        SELECT id_provider_bank_account
        FROM provider_bank_accounts
        WHERE id_provider = ?
        LIMIT 1
      `,
      [data.id_provider],
    );

    if (existingAccounts.length > 0) {
      throw makeError("Provider sudah memiliki rekening bank", 409);
    }

    const [result] = await connection.query(
      `
        INSERT INTO provider_bank_accounts (
          bank_code,
          bank_name,
          account_number,
          account_holder_name,
          is_active,
          verification_status,
          id_provider
        )
        VALUES (?, ?, ?, ?, 'TRUE', 'PENDING', ?)
      `,
      [
        data.bank_code,
        data.bank_name,
        data.account_number,
        data.account_holder_name,
        data.id_provider,
      ],
    );

    if (result.affectedRows !== 1) {
      throw makeError("Gagal menambahkan rekening bank", 500);
    }

    await connection.commit();

    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// UPDATE BANK ACCOUNT
export async function updateBankAccount(bankAccountId, data) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Temukan provider pemilik rekening.
    const [accountInfo] = await connection.query(
      `
        SELECT id_provider
        FROM provider_bank_accounts
        WHERE id_provider_bank_account = ?
        LIMIT 1
      `,
      [bankAccountId],
    );

    if (accountInfo.length === 0) {
      throw makeError("Rekening bank tidak ditemukan", 404);
    }

    const providerId = accountInfo[0].id_provider;

    // Gunakan urutan lock provider lalu rekening.
    const [providers] = await connection.query(
      `
        SELECT id_provider
        FROM providers
        WHERE id_provider = ?
        LIMIT 1
        FOR UPDATE
      `,
      [providerId],
    );

    if (providers.length === 0) {
      throw makeError("Provider tidak ditemukan", 404);
    }

    const [accounts] = await connection.query(
      `
        SELECT
          id_provider_bank_account,
          id_provider
        FROM provider_bank_accounts
        WHERE id_provider_bank_account = ?
          AND id_provider = ?
        LIMIT 1
        FOR UPDATE
      `,
      [bankAccountId, providerId],
    );

    if (accounts.length === 0) {
      throw makeError("Rekening bank tidak ditemukan", 404);
    }

    // Jangan mengubah detail rekening yang sudah
    // digunakan dalam riwayat settlement.
    const [settlements] = await connection.query(
      `
        SELECT id_provider_settlement
        FROM provider_settlements
        WHERE id_provider_bank_account = ?
        LIMIT 1
      `,
      [bankAccountId],
    );

    if (settlements.length > 0) {
      throw makeError(
        "Rekening sudah digunakan dalam settlement. Detail rekening tidak dapat diubah langsung.",
        409,
      );
    }

    const [result] = await connection.query(
      `
        UPDATE provider_bank_accounts
        SET
          bank_code = ?,
          bank_name = ?,
          account_number = ?,
          account_holder_name = ?,
          verification_status = 'PENDING'
        WHERE id_provider_bank_account = ?
          AND id_provider = ?
      `,
      [
        data.bank_code,
        data.bank_name,
        data.account_number,
        data.account_holder_name,
        bankAccountId,
        providerId,
      ],
    );

    if (result.affectedRows !== 1) {
      throw makeError("Gagal memperbarui rekening bank", 500);
    }

    await connection.commit();

    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// UPDATE ACTIVE STATUS
export async function setBankAccountActive(bankAccountId, isActive) {
  const [result] = await db.query(
    `
      UPDATE provider_bank_accounts
      SET is_active = ?
      WHERE id_provider_bank_account = ?
    `,
    [isActive ? "TRUE" : "FALSE", bankAccountId],
  );

  return result.affectedRows > 0;
}

// UPDATE VERIFICATION STATUS
export async function updateBankAccountVerification(
  bankAccountId,
  verificationStatus,
) {
  const [result] = await db.query(
    `
      UPDATE provider_bank_accounts
      SET verification_status = ?
      WHERE id_provider_bank_account = ?
    `,
    [verificationStatus, bankAccountId],
  );

  return result.affectedRows > 0;
}
