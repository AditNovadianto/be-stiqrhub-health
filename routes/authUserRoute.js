import express from "express";
import {
  forgotPassword,
  getAllUsers,
  resetPassword,
  signInUser,
  signUpUser,
} from "../controllers/authUserController.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

router.post("/user/sign-up", signUpUser);
router.post("/user/sign-in", signInUser);
router.get("/user/get-all", verifyToken, getAllUsers);
router.post("/user/forgot-password", forgotPassword);
router.post("/user/reset-password/:token", resetPassword);

export default router;
