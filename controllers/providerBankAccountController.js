import * as bankModel from "../models/providerBankAccountModel.js";

// HELPERS
const makeError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isValidId = (value) =>
  /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));

// VALIDATE BANK ACCOUNT DATA
const validateBankAccountData = (body, requireProvider = false) => {
  const fields = {
    bank_code: 30,
    bank_name: 100,
    account_number: 50,
    account_holder_name: 255,
  };

  const data = {};

  for (const [field, maxLength] of Object.entries(fields)) {
    const value = body?.[field];

    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.trim().length > maxLength
    ) {
      throw makeError(
        `${field} wajib diisi dan maksimal ${maxLength} karakter`,
        400,
      );
    }

    data[field] = value.trim();
  }

  if (!/^[A-Za-z0-9_-]+$/.test(data.bank_code)) {
    throw makeError(
      "bank_code hanya boleh berisi huruf, angka, underscore, atau tanda hubung",
    );
  }

  // Simpan sebagai string supaya angka 0 di depan tidak hilang.
  if (!/^\d{5,50}$/.test(data.account_number)) {
    throw makeError(
      "Nomor rekening harus terdiri dari 5 sampai 50 digit angka",
    );
  }

  if (requireProvider) {
    if (!isValidId(body?.id_provider)) {
      throw makeError("ID provider tidak valid");
    }

    data.id_provider = Number(body.id_provider);
  }

  return data;
};

// ERROR HANDLER
const handleError = (res, error) => {
  console.error("[PROVIDER BANK ACCOUNT]", error);

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "Data rekening sudah terdaftar",
    });
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      success: false,
      message: "Provider tidak valid",
    });
  }

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// CREATE BANK ACCOUNT
export const createProviderBankAccount = async (req, res) => {
  try {
    const data = validateBankAccountData(req.body, true);

    const bankAccountId = await bankModel.createBankAccount(data);

    const account = await bankModel.getBankAccountById(bankAccountId);

    return res.status(201).json({
      success: true,
      message:
        "Rekening bank provider berhasil didaftarkan dan menunggu verifikasi",
      data: account,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET ALL BANK ACCOUNTS
export const getAllProviderBankAccounts = async (req, res) => {
  try {
    const accounts = await bankModel.getAllBankAccounts();

    return res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET BANK ACCOUNT BY PROVIDER
export const getProviderBankAccountByProvider = async (req, res) => {
  try {
    const { id_provider } = req.params;

    if (!isValidId(id_provider)) {
      throw makeError("ID provider tidak valid");
    }

    const account = await bankModel.getBankAccountByProvider(
      Number(id_provider),
    );

    if (!account) {
      throw makeError("Rekening bank provider tidak ditemukan", 404);
    }

    return res.status(200).json({
      success: true,
      data: account,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET BANK ACCOUNT BY ID
export const getProviderBankAccountById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      throw makeError("ID rekening bank tidak valid");
    }

    const account = await bankModel.getBankAccountById(Number(id));

    if (!account) {
      throw makeError("Rekening bank tidak ditemukan", 404);
    }

    return res.status(200).json({
      success: true,
      data: account,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// UPDATE BANK ACCOUNT
export const updateProviderBankAccount = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      throw makeError("ID rekening bank tidak valid");
    }

    const data = validateBankAccountData(req.body);

    await bankModel.updateBankAccount(Number(id), data);

    const updatedAccount = await bankModel.getBankAccountById(Number(id));

    return res.status(200).json({
      success: true,
      message:
        "Rekening bank berhasil diperbarui dan menunggu verifikasi ulang",
      data: updatedAccount,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ACTIVATE / DEACTIVATE BANK ACCOUNT
export const updateProviderBankAccountStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body || {};

    if (!isValidId(id)) {
      throw makeError("ID rekening bank tidak valid");
    }

    if (is_active !== "TRUE" && is_active !== "FALSE") {
      throw makeError("is_active harus bernilai TRUE atau FALSE");
    }

    const updated = await bankModel.setBankAccountActive(
      Number(id),
      is_active === "TRUE",
    );

    if (!updated) {
      throw makeError("Rekening bank tidak ditemukan", 404);
    }

    const account = await bankModel.getBankAccountById(Number(id));

    return res.status(200).json({
      success: true,
      message:
        is_active === "TRUE"
          ? "Rekening bank berhasil diaktifkan"
          : "Rekening bank berhasil dinonaktifkan",
      data: account,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// UPDATE VERIFICATION STATUS
export const verifyProviderBankAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { verification_status } = req.body || {};

    if (!isValidId(id)) {
      throw makeError("ID rekening bank tidak valid");
    }

    const allowedStatuses = ["PENDING", "VERIFIED", "REJECTED"];

    if (!allowedStatuses.includes(verification_status)) {
      throw makeError(
        "verification_status harus PENDING, VERIFIED, atau REJECTED",
      );
    }

    const updated = await bankModel.updateBankAccountVerification(
      Number(id),
      verification_status,
    );

    if (!updated) {
      throw makeError("Rekening bank tidak ditemukan", 404);
    }

    const account = await bankModel.getBankAccountById(Number(id));

    return res.status(200).json({
      success: true,
      message: "Status verifikasi rekening berhasil diperbarui",
      data: account,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
