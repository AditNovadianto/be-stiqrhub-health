import express from "express";
import { verifyToken } from "../middleware/auth.js";
import {
  forgotPasswordCustomer,
  getAllCustomers,
  resetPasswordCustomer,
  signInCustomer,
  signUpCustomer,
} from "../controllers/authCustomerController.js";

const router = express.Router();

router.post("/customer/sign-up", signUpCustomer);
router.post("/customer/sign-in", signInCustomer);
router.get("/customer/get-all", verifyToken, getAllCustomers);
router.post("/customer/forgot-password", forgotPasswordCustomer);
router.post("/customer/reset-password/:token", resetPasswordCustomer);

export default router;
