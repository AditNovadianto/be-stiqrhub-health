import express from "express";

import {
  getByOrder,
  getMyHealthPasses,
  getProviderHealthPasses,
  verifyByQr,
  verifyById,
  redeemByQr,
  redeemById,
  getAllHealthPassesAdmin,
  finishById,
  requestFinishOtp,
} from "../controllers/healthPassesController.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// ============================================================
// ADMIN ROUTES
// ============================================================

router.get(
  "/health-passes/admin/get-all",
  verifyToken,
  getAllHealthPassesAdmin,
);

// ============================================================
// CUSTOMER ROUTES
// ============================================================

// Health Pass berdasarkan order.
router.get("/health-passes/order/:id_order", verifyToken, getByOrder);

// Semua Health Pass milik customer login.
router.get("/health-passes/my", verifyToken, getMyHealthPasses);

// ============================================================
// PROVIDER ROUTES
// ============================================================

// Semua Health Pass milik provider login.
router.get("/health-passes/provider", verifyToken, getProviderHealthPasses);

// VERIFY
// Scan QR.
router.post("/health-passes/provider/verify/qr", verifyToken, verifyByQr);

// Input manual ID Health Pass.
router.post("/health-passes/provider/verify/id", verifyToken, verifyById);

// REDEEM
// Redeem menggunakan QR.
router.post("/health-passes/provider/redeem/qr", verifyToken, redeemByQr);

// Redeem menggunakan input ID.
router.post("/health-passes/provider/redeem/id", verifyToken, redeemById);

// REQUEST OTP FINISH TREATMENT
router.post(
  "/health-passes/provider/finish/:id_health_pass/request-otp",
  verifyToken,
  requestFinishOtp,
);

// FINISH TREATMENT
router.patch(
  "/health-passes/provider/finish/:id_health_pass",
  verifyToken,
  finishById,
);

export default router;
