import express from "express";
import { db } from "../config/db.js";

import {
  getAllProviderSettlements,
  getProviderSettlementById,
  generateProviderSettlements,
  reconcileProviderSettlement,
} from "../controllers/providerSettlementController.js";

const router = express.Router();

import { verifyToken } from "../middleware/auth.js";

const adminRoles = new Set(["ADMIN", "SUPER_ADMIN", "SUPERADMIN"]);

const checkPlatformAdmin = async (req, res, next) => {
  try {
    const idUser = Number(req.user?.id_user);

    if (!Number.isSafeInteger(idUser) || idUser <= 0) {
      return res.status(403).json({
        success: false,
        message: "Akses khusus administrator platform.",
      });
    }

    const [rows] = await db.query(
      `
        SELECT
          u.id_user,
          u.status_user,
          ur.name_user_role
        FROM users u
        INNER JOIN user_roles ur
          ON ur.id_user_role = u.id_user_role
        WHERE u.id_user = ?
        LIMIT 1
      `,
      [idUser],
    );

    const admin = rows[0];

    if (!admin) {
      return res.status(403).json({
        success: false,
        message: "Akun administrator tidak ditemukan.",
      });
    }

    if (String(admin.status_user).trim().toUpperCase() !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Akun administrator tidak aktif.",
      });
    }

    const role = String(admin.name_user_role).trim().toUpperCase();

    if (!adminRoles.has(role)) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki izin mengelola rekening provider.",
      });
    }

    return next();
  } catch (error) {
    console.error("[PROVIDER BANK ADMIN CHECK]", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memeriksa hak akses administrator.",
    });
  }
};

// ============================================================
// ADMIN-ONLY ROUTES
// ============================================================

router.use("/provider-settlement", verifyToken);
// router.use(checkPlatformAdmin);

// ============================================================
// LOCAL DEVELOPMENT ACCESS GUARD
// ============================================================

router.use("/provider-settlement", (req, res, next) => {
  if (process.env.SETTLEMENT_DEV_API !== "true") {
    return res.status(403).json({
      success: false,
      message: "Settlement API belum diaktifkan",
    });
  }

  const allowed = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

  if (!allowed.has(req.socket.remoteAddress)) {
    return res.status(403).json({
      success: false,
      message: "Settlement API hanya dapat diakses melalui localhost",
    });
  }

  return next();
});

// ============================================================
// ROUTES
// ============================================================

// GET ALL
router.get("/provider-settlement/get-all", getAllProviderSettlements);

// GENERATE H+1 - NO BANK TRANSFER
router.post("/provider-settlement/generate", generateProviderSettlements);

// GET BY ID
router.get("/provider-settlement/:id", getProviderSettlementById);

// INQUIRE DANA TRANSFER STATUS
router.post("/provider-settlement/:id/reconcile", reconcileProviderSettlement);

export default router;
