import express from "express";

import { verifyToken } from "../../../middleware/auth.js";

import { nobuCustomerMiddleware } from "../middleware/nobuCustomerMiddleware.js";

import {
  createNobuQrisController,
  checkNobuQrisController,
} from "../controllers/nobuQrisController.js";

import { nobuQrisCallbackController } from "../controllers/nobuCallbackController.js";

import { cancelNobuQrisController } from "../controllers/nobuCancelController.js";

const router = express.Router();

// Callback middleware.
// Pertahankan pembatasan akses / autentikasi
// forwarding dari konfigurasi production.
router.post("/callback", nobuQrisCallbackController);

// Generate QRIS
router.post(
  "/create",
  verifyToken,
  nobuCustomerMiddleware,
  createNobuQrisController,
);

// Cancel payment
router.post(
  "/:id_order/cancel",
  verifyToken,
  nobuCustomerMiddleware,
  cancelNobuQrisController,
);

// Check payment status
router.get(
  "/:id_order/status",
  verifyToken,
  nobuCustomerMiddleware,
  checkNobuQrisController,
);

export default router;
