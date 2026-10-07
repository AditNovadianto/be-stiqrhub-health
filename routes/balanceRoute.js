import express from "express";

import {
  getAllBalances,
  getBalanceById,
  getBalanceByProvider,
  getMyBalance,
  getBalanceSummary,
} from "../controllers/balanceController.js";

import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// ============================================================
// PROVIDER AUTHENTICATED
// ============================================================
//
// Provider user login:
// req.user.id_provider

router.get("/balances/my", verifyToken, getMyBalance);

// ============================================================
// INTERNAL / ADMIN
// ============================================================

router.get("/balances", verifyToken, getAllBalances);

router.get("/balances/summary", verifyToken, getBalanceSummary);

router.get(
  "/balances/provider/:id_provider",
  verifyToken,
  getBalanceByProvider,
);

router.get("/balances/:id", verifyToken, getBalanceById);

export default router;
