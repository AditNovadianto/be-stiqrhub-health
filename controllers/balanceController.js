import * as balanceModel from "../models/balanceModel.js";

// HELPERS
const handleError = (res, error) => {
  console.error("[BALANCE ERROR]", error);

  return res.status(error.statusCode || 500).json({
    success: false,

    message: error.message || "Terjadi kesalahan pada balance",
  });
};

const isValidPositiveInteger = (value) => {
  const number = Number(value);

  return Number.isInteger(number) && number > 0;
};

// GET ALL BALANCES
export async function getAllBalances(req, res) {
  try {
    const balances = await balanceModel.getAllBalances();

    return res.status(200).json({
      success: true,

      data: balances,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET BALANCE BY ID
export async function getBalanceById(req, res) {
  try {
    const { id } = req.params;

    if (!isValidPositiveInteger(id)) {
      return res.status(400).json({
        success: false,

        message: "ID balance tidak valid",
      });
    }

    const balance = await balanceModel.getBalanceById(Number(id));

    if (!balance) {
      return res.status(404).json({
        success: false,

        message: "Balance tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,

      data: balance,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET BALANCE BY PROVIDER PARAM
//
// Internal/admin.
// Provider-specific authenticated endpoint
// sebaiknya menggunakan getMyBalance.
export async function getBalanceByProvider(req, res) {
  try {
    const { id_provider } = req.params;

    if (!isValidPositiveInteger(id_provider)) {
      return res.status(400).json({
        success: false,

        message: "ID provider tidak valid",
      });
    }

    await balanceModel.ensureProviderExists(Number(id_provider));

    const balance = await balanceModel.getBalanceByProvider(
      Number(id_provider),
    );

    return res.status(200).json({
      success: true,

      data: balance,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET MY PROVIDER BALANCE
//
// JWT provider kamu:
// req.user.id_provider
export async function getMyBalance(req, res) {
  try {
    const idProvider =
      req.user && req.user.id_provider ? req.user.id_provider : null;

    if (!idProvider) {
      return res.status(401).json({
        success: false,

        message: "ID provider tidak tersedia pada token",
      });
    }

    await balanceModel.ensureProviderExists(Number(idProvider));

    const balance = await balanceModel.getProviderBalanceSummary(
      Number(idProvider),
    );

    return res.status(200).json({
      success: true,

      data: balance,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET GLOBAL BALANCE SUMMARY
export async function getBalanceSummary(req, res) {
  try {
    const summary = await balanceModel.getBalanceSummary();

    return res.status(200).json({
      success: true,

      data: summary,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
