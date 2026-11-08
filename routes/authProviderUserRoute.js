import express from "express";
import { verifyToken } from "../middleware/auth.js";

import {
  forgotPasswordProviderUser,
  getAllProviderUsers,
  getProviderUsersByProvider,
  resetPasswordProviderUser,
  signInProviderUser,
  signUpProviderUser,
  updateProviderUserStatus,
} from "../controllers/authProviderUserController.js";

const router = express.Router();

router.post("/provider-user/sign-up", signUpProviderUser);
router.post("/provider-user/sign-in", signInProviderUser);
router.get("/provider-user/get-all", verifyToken, getAllProviderUsers);
router.get(
  "/provider-user/provider/:id_provider",
  verifyToken,
  getProviderUsersByProvider,
);
router.post("/provider-user/forgot-password", forgotPasswordProviderUser);
router.post("/provider-user/reset-password/:token", resetPasswordProviderUser);
router.patch(
  "/provider-user/:id/status",
  verifyToken,
  updateProviderUserStatus,
);

export default router;
