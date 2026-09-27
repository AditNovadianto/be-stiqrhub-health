import { Router } from "express";

import {
  danaLogin,
  danaCompleteProfile,
  danaMe,
  authenticateDana,
  danaLinkOnboarding,
  getAuthStatus,
} from "../controllers/danaAuthController.js";

import { verifyDanaCustomer } from "../middleware/danaCustomerMiddleware.js";

const router = Router();

// Login awal dari DANA.
router.post("/auth/login", danaLogin);

// Registrasi customer baru dengan password.
router.post("/auth/complete-profile", danaCompleteProfile);

// Customer website existing yang sedang
// menghubungkan akun dari proses onboarding.
router.post("/auth/link-onboarding", verifyDanaCustomer, danaLinkOnboarding);

// Linking menggunakan auth code DANA baru.
router.post("/auth/link", verifyDanaCustomer, authenticateDana);

// Profil customer.
router.get("/auth/me", verifyDanaCustomer, danaMe);

// Status akun DANA.
router.get("/auth/status", verifyDanaCustomer, getAuthStatus);

export default router;
