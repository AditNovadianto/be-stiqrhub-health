import { Router } from "express";

import { verifyToken } from "../middleware/auth.js";

import {
  getBeneficiaryBanks,
  validateBeneficiaryBank,
} from "../controllers/bankCatalogController.js";

const router = Router();

// LIST BANKS
router.get("/bank-catalog/get-all", verifyToken, getBeneficiaryBanks);

// VALIDATE BANK NAME + CODE
router.get("/bank-catalog/validate", verifyToken, validateBeneficiaryBank);

export default router;
