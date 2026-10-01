import express from "express";

import { verifyToken } from "../middleware/auth.js";

import {
  createOrder,
  getAllOrders,
  getOrderById,
  getOrdersByCustomer,
  getOrdersByProvider,
  paymentCallback,
  updateDanaPaymentInfo,
} from "../controllers/orderController.js";

const router = express.Router();

router.post("/order/create", verifyToken, createOrder);
router.get("/order/get-all", verifyToken, getAllOrders);
router.get("/order/:id", verifyToken, getOrderById);
router.get("/order/customer/:id_customer", verifyToken, getOrdersByCustomer);
router.get("/order/provider/:id_provider", verifyToken, getOrdersByProvider);
router.patch("/order/:id/payment", verifyToken, updateDanaPaymentInfo);
router.post("/order/payment/callback", paymentCallback);

export default router;
