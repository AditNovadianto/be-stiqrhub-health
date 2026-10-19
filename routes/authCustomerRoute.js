import express from "express";
import { verifyToken } from "../middleware/auth.js";

import {
  signUpCustomer,
  signInCustomer,
  resendCustomerOtp,
  verifyCustomerOtp,
  verifyCustomerLoginOtp,
  getAllCustomers,
  getCustomerById,
} from "../controllers/authCustomerController.js";

const router = express.Router();

// CUSTOMER REGISTRATION
router.post("/customer/sign-up", signUpCustomer);

// CUSTOMER LOGIN
router.post("/customer/sign-in", signInCustomer);

// CUSTOMER OTP
// Resend OTP untuk registrasi / login
router.post("/customer/resend-otp", resendCustomerOtp);

// Verifikasi OTP setelah registrasi
router.post("/customer/verify-otp", verifyCustomerOtp);

// Verifikasi OTP untuk login
router.post("/customer/verify-login-otp", verifyCustomerLoginOtp);

// CUSTOMER DATA
// Get all customers
router.get("/customer/get-all", verifyToken, getAllCustomers);

// Get customer by ID
router.get("/customer/:id", verifyToken, getCustomerById);

export default router;
