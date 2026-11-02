import jwt from "jsonwebtoken";

import * as healthPassesModel from "../models/healthPassesModel.js";

// HELPERS
const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getQrSecret = () => {
  const secret = process.env.HEALTH_PASS_QR_SECRET;

  if (!secret) {
    throw errorWithStatus("HEALTH_PASS_QR_SECRET belum dikonfigurasi", 500);
  }

  return secret;
};

const isValidString = (value) => {
  return typeof value === "string" && value.trim().length > 0;
};

// AUTH HELPERS
const getProviderId = (req) => {
  const idProvider = req.user?.id_provider;

  if (!idProvider) {
    throw errorWithStatus("ID provider tidak tersedia pada token", 401);
  }

  return idProvider;
};

const getProviderUserId = (req) => {
  const idProviderUser = req.user?.sub;

  if (!idProviderUser) {
    throw errorWithStatus("ID provider user tidak tersedia pada token", 401);
  }

  return idProviderUser;
};

const getCustomerId = (req) => {
  const idCustomer = req.user?.id_customer;

  if (!idCustomer) {
    throw errorWithStatus("ID customer tidak tersedia pada token", 401);
  }

  return idCustomer;
};

// GENERATE HEALTH PASS QR TOKEN
export const generateQrToken = (healthPass) => {
  if (
    !healthPass?.id_health_pass ||
    !healthPass?.id_order ||
    !healthPass?.id_service ||
    !healthPass?.id_provider
  ) {
    throw errorWithStatus("Data Health Pass untuk QR tidak lengkap", 500);
  }

  // valid_until menggunakan timezone WIB (+07:00)
  const validUntilMs = Date.parse(healthPass.valid_until);

  if (!Number.isFinite(validUntilMs)) {
    throw errorWithStatus("Tanggal akhir Health Pass tidak valid", 500);
  }

  const nowSec = Math.floor(Date.now() / 1000);

  const validUntilSec = Math.floor(validUntilMs / 1000);

  // QR untuk Health Pass yang masih berlaku
  // mengikuti valid_until.
  //
  // Health Pass expired tetap dapat tampil di daftar.
  // QR expired diberi masa hidup singkat, tetapi
  // redeem tetap akan ditolak oleh validasi database.
  const expiresAt = Math.max(validUntilSec, nowSec + 60);

  return jwt.sign(
    {
      type: "HEALTH_PASS",
      id_health_pass: healthPass.id_health_pass,
      id_order: healthPass.id_order,
      id_service: healthPass.id_service,
      id_provider: healthPass.id_provider,
    },
    getQrSecret(),
    {
      algorithm: "HS256",
      expiresIn: expiresAt - nowSec,
    },
  );
};

// VERIFY QR TOKEN
const verifyQrToken = (qr_token) => {
  if (!isValidString(qr_token)) {
    throw errorWithStatus("QR token wajib diisi", 400);
  }

  try {
    const payload = jwt.verify(qr_token, getQrSecret(), {
      algorithms: ["HS256"],
    });

    if (payload.type !== "HEALTH_PASS") {
      throw new Error("Token type tidak valid");
    }

    if (
      !payload.id_health_pass ||
      !payload.id_order ||
      !payload.id_service ||
      !payload.id_provider
    ) {
      throw new Error("Payload QR tidak lengkap");
    }

    return payload;
  } catch {
    throw errorWithStatus(
      "QR Health Pass tidak valid atau sudah kedaluwarsa",
      401,
    );
  }
};

// RESPONSE ERROR
const handleError = (res, error) => {
  console.error("[HEALTH PASS ERROR]", error);

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Terjadi kesalahan pada Health Pass",
  });
};

// CUSTOMER
// GET HEALTH PASS BY ORDER
export async function getByOrder(req, res) {
  try {
    const { id_order } = req.params;

    if (!isValidString(id_order)) {
      throw errorWithStatus("ID order tidak valid", 400);
    }

    const idCustomer = getCustomerId(req);

    const healthPass = await healthPassesModel.getHealthPassByOrderForCustomer(
      id_order,
      idCustomer,
    );

    if (!healthPass) {
      throw errorWithStatus("Health Pass tidak ditemukan", 404);
    }

    const qrToken = generateQrToken(healthPass);

    return res.status(200).json({
      success: true,
      data: {
        ...healthPass,
        qr_token: qrToken,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// CUSTOMER
// GET ALL MY HEALTH PASSES
export async function getMyHealthPasses(req, res) {
  try {
    const idCustomer = getCustomerId(req);

    const rows = await healthPassesModel.getHealthPassesByCustomer(idCustomer);

    const data = rows.map((healthPass) => {
      return {
        ...healthPass,
        qr_token: generateQrToken(healthPass),
      };
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// PROVIDER
// GET ALL HEALTH PASSES
export async function getProviderHealthPasses(req, res) {
  try {
    const idProvider = getProviderId(req);

    const rows = await healthPassesModel.getHealthPassesByProvider(idProvider);

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// PROVIDER
// VERIFY BY QR
export async function verifyByQr(req, res) {
  try {
    const { qr_token } = req.body;

    const idProvider = getProviderId(req);

    const payload = verifyQrToken(qr_token);

    // PROVIDER DI QR HARUS SAMA DENGAN PROVIDER LOGIN
    if (Number(payload.id_provider) !== Number(idProvider)) {
      throw errorWithStatus("QR Health Pass bukan untuk provider ini", 403);
    }

    const healthPass = await healthPassesModel.validateHealthPassForProvider(
      payload.id_health_pass,
      idProvider,
    );

    // CROSS CHECK QR VS DATABASE
    if (String(healthPass.id_order) !== String(payload.id_order)) {
      throw errorWithStatus("Order pada QR tidak sesuai", 409);
    }

    if (Number(healthPass.id_service) !== Number(payload.id_service)) {
      throw errorWithStatus("Service pada QR tidak sesuai", 409);
    }

    if (Number(healthPass.id_provider) !== Number(payload.id_provider)) {
      throw errorWithStatus("Provider pada QR tidak sesuai", 409);
    }

    return res.status(200).json({
      success: true,
      message: "Health Pass valid",
      data: healthPass,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// PROVIDER
// VERIFY BY MANUAL ID
export async function verifyById(req, res) {
  try {
    const { id_health_pass } = req.body;

    if (!isValidString(id_health_pass)) {
      throw errorWithStatus("ID Health Pass wajib diisi", 400);
    }

    const idProvider = getProviderId(req);

    const healthPass = await healthPassesModel.validateHealthPassForProvider(
      id_health_pass.trim(),
      idProvider,
    );

    return res.status(200).json({
      success: true,
      message: "Health Pass valid",
      data: healthPass,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// PROVIDER
// REDEEM BY QR
export async function redeemByQr(req, res) {
  try {
    const { qr_token } = req.body;

    const idProvider = getProviderId(req);

    const idProviderUser = getProviderUserId(req);

    const payload = verifyQrToken(qr_token);

    if (Number(payload.id_provider) !== Number(idProvider)) {
      throw errorWithStatus("QR Health Pass bukan untuk provider ini", 403);
    }

    // VERIFY DB BEFORE REDEEM
    const healthPass = await healthPassesModel.validateHealthPassForProvider(
      payload.id_health_pass,
      idProvider,
    );

    // CROSS CHECK TOKEN
    if (String(healthPass.id_order) !== String(payload.id_order)) {
      throw errorWithStatus("Order pada QR tidak sesuai", 409);
    }

    if (Number(healthPass.id_service) !== Number(payload.id_service)) {
      throw errorWithStatus("Service pada QR tidak sesuai", 409);
    }

    if (Number(healthPass.id_provider) !== Number(payload.id_provider)) {
      throw errorWithStatus("Provider pada QR tidak sesuai", 409);
    }

    // REDEEM
    const result = await healthPassesModel.redeemHealthPass({
      id_health_pass: payload.id_health_pass,
      id_provider: idProvider,
      redeemed_by: idProviderUser,
    });

    return res.status(200).json({
      success: true,
      message: "Health Pass berhasil diredeem melalui QR",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// PROVIDER
// REDEEM BY MANUAL ID
export async function redeemById(req, res) {
  try {
    const { id_health_pass } = req.body;

    if (!isValidString(id_health_pass)) {
      throw errorWithStatus("ID Health Pass wajib diisi", 400);
    }

    const idProvider = getProviderId(req);

    const idProviderUser = getProviderUserId(req);

    // VERIFY FIRST
    await healthPassesModel.validateHealthPassForProvider(
      id_health_pass.trim(),
      idProvider,
    );

    // REDEEM
    const result = await healthPassesModel.redeemHealthPass({
      id_health_pass: id_health_pass.trim(),
      id_provider: idProvider,
      redeemed_by: idProviderUser,
    });

    return res.status(200).json({
      success: true,
      message: "Health Pass berhasil diredeem melalui ID",
      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
