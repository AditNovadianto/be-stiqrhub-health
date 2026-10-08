import express from "express";

import {
  getAllProviderCategories,
  getActiveProviderCategories,
  getProviderCategoryById,
  createProviderCategory,
  updateProviderCategory,
  deleteProviderCategory,
} from "../controllers/providerCategoryController.js";

import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// ============================================================
// PUBLIC / REGISTRATION SUPPORT
// ============================================================
//
// Endpoint active bisa dipakai saat form registrasi provider.

router.get("/provider-categories/active", getActiveProviderCategories);

// ============================================================
// AUTHENTICATED
// ============================================================

router.get(
  "/provider-categories/get-all",
  verifyToken,
  getAllProviderCategories,
);

router.get(
  "/provider-categories/:id_provider_category",
  verifyToken,
  getProviderCategoryById,
);

router.post("/provider-categories/create", verifyToken, createProviderCategory);

router.patch(
  "/provider-categories/:id_provider_category",
  verifyToken,
  updateProviderCategory,
);

router.delete(
  "/provider-categories/:id_provider_category",
  verifyToken,
  deleteProviderCategory,
);

export default router;
