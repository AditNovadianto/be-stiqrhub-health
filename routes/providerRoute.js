import { Router } from "express";
import { uploadProvider } from "../middleware/uploadProvider.js";
import { verifyToken } from "../middleware/auth.js";
import {
  approveProvider,
  createProvider,
  deleteProvider,
  getAllProviders,
  getProviderById,
  rejectProvider,
  resendProviderOtp,
  updateProvider,
  verifyProviderOtp,
} from "../controllers/providerController.js";

const router = Router();

// REGISTRASI
router.post("/provider/create", uploadProvider, createProvider);

// OTP
router.post("/provider/:id/resend-otp", resendProviderOtp);

router.post("/provider/:id/verify-otp", verifyProviderOtp);

// CRUD
router.get("/provider/get-all", verifyToken, getAllProviders);

router.get("/provider/:id", verifyToken, getProviderById);

router.patch("/provider/:id", verifyToken, uploadProvider, updateProvider);

router.delete("/provider/:id", verifyToken, deleteProvider);

// APPROVAL INTERNAL
router.patch("/provider/:id/approve", verifyToken, approveProvider);

router.patch("/provider/:id/reject", verifyToken, rejectProvider);

export default router;
