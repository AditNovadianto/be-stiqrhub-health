import express from "express";
import { db } from "../config/db.js";
import { verifyToken } from "../middleware/auth.js";

import {
  createProviderBankAccount,
  getAllProviderBankAccounts,
  getProviderBankAccountByProvider,
  getProviderBankAccountById,
  updateProviderBankAccount,
  updateProviderBankAccountStatus,
  verifyProviderBankAccount,
} from "../controllers/providerBankAccountController.js";

const router = express.Router();

// ============================================================
// ADMIN ACCESS CHECK - DISABLED
// ============================================================

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

router.use("/provider-bank-account", verifyToken);
// router.use(checkPlatformAdmin);

// ============================================================
// GET ALL
// ============================================================

router.get("/provider-bank-account/get-all", getAllProviderBankAccounts);

// ============================================================
// CREATE
// ============================================================

router.post("/provider-bank-account/create", createProviderBankAccount);

// ============================================================
// GET BY PROVIDER ID
// ============================================================

router.get(
  "/provider-bank-account/provider/:id_provider",
  getProviderBankAccountByProvider,
);

// ============================================================
// GET BY BANK ACCOUNT ID
// ============================================================

router.get("/provider-bank-account/:id", getProviderBankAccountById);

// ============================================================
// UPDATE BANK ACCOUNT
// ============================================================

router.put("/provider-bank-account/:id", updateProviderBankAccount);

// ============================================================
// ACTIVATE / DEACTIVATE BANK ACCOUNT
// ============================================================

router.patch(
  "/provider-bank-account/:id/status",
  updateProviderBankAccountStatus,
);

// ============================================================
// UPDATE VERIFICATION STATUS
// ============================================================

router.patch(
  "/provider-bank-account/:id/verification",
  verifyProviderBankAccount,
);

export default router;
