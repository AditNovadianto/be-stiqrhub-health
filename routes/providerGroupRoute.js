import express from "express";

import { db } from "../config/db.js";
import { verifyToken } from "../middleware/auth.js";

import {
  getAllProviderGroups,
  getProviderGroupById,
  createProviderGroup,
  updateProviderGroup,
  addProvidersToGroup,
  removeProviderFromGroup,
  deleteProviderGroup,
  getEligibleProviders,
  getBranchesByService,
} from "../controllers/providerGroupController.js";

const router = express.Router();

// ============================================================
// ADMIN ACCESS CHECK
// ============================================================

// Middleware lokal, tidak memerlukan file terpisah.
// Sesuaikan daftar nama role jika database kamu
// menggunakan nomenklatur role yang berbeda.

const adminRoles = new Set(["ADMIN", "SUPER_ADMIN", "SUPERADMIN"]);

const checkPlatformAdmin = async (req, res, next) => {
  try {
    // Identitas diambil dari JWT yang sudah diverifikasi.
    // Jangan menerima id_user dari request body/params.

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

    if (String(admin.status_user).toUpperCase() !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Akun administrator tidak aktif.",
      });
    }

    const role = String(admin.name_user_role).trim().toUpperCase();

    if (!adminRoles.has(role)) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki izin untuk mengelola provider group.",
      });
    }

    return next();
  } catch (error) {
    console.error("[PROVIDER GROUP ADMIN CHECK]", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memeriksa hak akses administrator.",
    });
  }
};

// ============================================================
// PUBLIC ROUTES
// ============================================================

// Referensi cabang untuk DetailService.
// Tidak mengubah data sehingga boleh dibaca customer.

router.get("/service/:serviceId/branches", getBranchesByService);

// ============================================================
// ADMIN-ONLY ROUTES
// ============================================================

// verifyToken harus memverifikasi JWT user internal,
// bukan mempercayai id_user dari body request.

router.use(verifyToken);

// GET ALL
router.get("/provider-group/get-all", getAllProviderGroups);

// CREATE
router.post("/provider-group/create", createProviderGroup);

// ELIGIBLE PROVIDERS
router.get("/provider-group/:id/eligible-providers", getEligibleProviders);

// DETAIL GROUP
router.get("/provider-group/:id", getProviderGroupById);

// UPDATE GROUP
router.patch("/provider-group/:id", updateProviderGroup);

// ADD MULTIPLE PROVIDERS
router.post("/provider-group/:id/providers", addProvidersToGroup);

// REMOVE PROVIDER
router.delete(
  "/provider-group/:id/providers/:providerId",
  removeProviderFromGroup,
);

// SOFT DELETE GROUP
router.delete("/provider-group/:id", deleteProviderGroup);

export default router;
