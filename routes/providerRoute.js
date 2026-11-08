import { Router } from "express";
import { uploadProvider } from "../middleware/uploadProvider.js";
import { verifyToken } from "../middleware/auth.js";
import jwt from "jsonwebtoken";
import * as providerModel from "../models/providerModel.js";
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  approveProvider,
  createProvider,
  deleteProvider,
  getAllProviders,
  getProviderById,
  rejectProvider,
  resendProviderOtp,
  requestProviderRevisionOtp,
  resubmitProvider,
  updateProvider,
  verifyProviderOtp,
  verifyProviderRevisionOtp,
} from "../controllers/providerController.js";

const router = Router();

const verifyProviderRevisionAccess = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "ID provider tidak valid",
      });
    }

    const authorization = req.headers.authorization;

    if (
      typeof authorization !== "string" ||
      !/^Bearer\s+\S+$/i.test(authorization.trim())
    ) {
      return res.status(401).json({
        success: false,
        message: "Revision token diperlukan",
      });
    }

    const token = authorization.trim().split(/\s+/)[1];

    const secret = process.env.PROVIDER_REVISION_SECRET;

    if (!secret || Buffer.byteLength(secret) < 32) {
      return res.status(500).json({
        success: false,
        message: "Konfigurasi revision token belum tersedia",
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        issuer: "stiQR-b2b",
        audience: "provider-revision",
        subject: String(Number(id)),
      });
    } catch (error) {
      if (
        error.name === "TokenExpiredError" ||
        error.name === "JsonWebTokenError" ||
        error.name === "NotBeforeError"
      ) {
        return res.status(401).json({
          success: false,
          message: "Revision token tidak valid atau kedaluwarsa",
        });
      }

      throw error;
    }

    if (
      !decoded ||
      typeof decoded !== "object" ||
      decoded.purpose !== "PROVIDER_REVISION" ||
      typeof decoded.email_provider !== "string"
    ) {
      return res.status(403).json({
        success: false,
        message: "Token tidak memiliki akses revisi",
      });
    }

    const provider = await providerModel.getProviderById(Number(id));

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider tidak ditemukan",
      });
    }

    if (provider.status_provider !== "REJECTED") {
      return res.status(409).json({
        success: false,
        message: "Provider tidak berstatus REJECTED",
      });
    }

    if (
      decoded.email_provider.trim().toLowerCase() !==
      provider.email_provider.trim().toLowerCase()
    ) {
      return res.status(403).json({
        success: false,
        message: "Token tidak sesuai dengan provider",
      });
    }

    req.providerRevision = {
      id_provider: Number(id),
      email_provider: provider.email_provider,
    };

    return next();
  } catch (error) {
    console.error("Revision access error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memverifikasi akses revisi",
    });
  }
};

const verifyProviderUpdateAccess = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) {
      return res.status(400).json({
        success: false,
        message: "ID provider tidak valid",
      });
    }

    const provider = await providerModel.getProviderById(Number(id));

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider tidak ditemukan",
      });
    }

    // REJECTED: tetap gunakan middleware revisi yang sudah ada
    if (provider.status_provider === "REJECTED") {
      return verifyProviderRevisionAccess(req, res, next);
    }

    if (provider.status_provider !== "PENDING_OTP") {
      return res.status(409).json({
        success: false,
        message: "UPDATE hanya diperbolehkan untuk PENDING_OTP atau REJECTED",
      });
    }

    // PENDING_OTP: butuh otp_token + kode OTP asli
    const authorization = req.headers.authorization;
    const otp = req.headers["x-provider-otp"];

    if (
      typeof authorization !== "string" ||
      !/^Bearer\s+\S+$/i.test(authorization.trim()) ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(401).json({
        success: false,
        message: "OTP token dan kode OTP diperlukan",
      });
    }

    const secret = process.env.PROVIDER_OTP_SECRET;

    if (!secret || Buffer.byteLength(secret) < 32) {
      return res.status(500).json({
        success: false,
        message: "Konfigurasi OTP provider belum tersedia",
      });
    }

    const token = authorization.trim().split(/\s+/)[1];

    let decoded;

    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        issuer: "stiQR-b2b",
        audience: "provider-otp",
        subject: String(Number(id)),
      });
    } catch (error) {
      if (
        ["TokenExpiredError", "JsonWebTokenError", "NotBeforeError"].includes(
          error.name,
        )
      ) {
        return res.status(401).json({
          success: false,
          message: "OTP token tidak valid atau sudah kedaluwarsa",
        });
      }

      throw error;
    }

    const email = provider.email_provider.trim().toLowerCase();

    if (
      !decoded ||
      typeof decoded !== "object" ||
      decoded.purpose !== "PROVIDER_OTP" ||
      decoded.email_provider !== email ||
      typeof decoded.jti !== "string" ||
      typeof decoded.otp_hash !== "string" ||
      !/^[a-f0-9]{64}$/.test(decoded.otp_hash)
    ) {
      return res.status(403).json({
        success: false,
        message: "Token tidak sesuai dengan provider",
      });
    }

    // Format hash mengikuti hashOtp() di providerModel.js
    const expectedHash = createHmac("sha256", secret)
      .update(`${Number(id)}:${email}:${decoded.jti}:${otp}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedHash, "hex");
    const actualBuffer = Buffer.from(decoded.otp_hash, "hex");

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      return res.status(401).json({
        success: false,
        message: "Kode OTP tidak valid",
      });
    }

    req.providerAccess = {
      id_provider: Number(id),
      purpose: "PROVIDER_OTP",
    };

    return next();
  } catch (error) {
    console.error("Provider update access error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memverifikasi akses UPDATE provider",
    });
  }
};

// REGISTRASI
router.post("/provider/create", uploadProvider, createProvider);

// OTP
router.post("/provider/:id/resend-otp", resendProviderOtp);

router.post("/provider/:id/verify-otp", verifyProviderOtp);

// OTP REVISI
router.post("/provider/:id/request-revision-otp", requestProviderRevisionOtp);

router.post("/provider/:id/verify-revision-otp", verifyProviderRevisionOtp);

// CRUD
router.get("/provider/get-all", verifyToken, getAllProviders);

router.get("/provider/:id", getProviderById);

router.patch(
  "/provider/:id",
  verifyProviderUpdateAccess,
  uploadProvider,
  updateProvider,
);

router.delete("/provider/:id", verifyToken, deleteProvider);

// APPROVAL INTERNAL
router.patch("/provider/:id/approve", verifyToken, approveProvider);

router.patch("/provider/:id/reject", verifyToken, rejectProvider);

// RESUBMIT PROVIDER
router.patch(
  "/provider/:id/resubmit",
  verifyProviderRevisionAccess,
  resubmitProvider,
);

export default router;
