// 3rd/routes/danaPaymentRoute.js

import express from "express";

import { createPayment } from "../controllers/danaPaymentController.js";

import { verifyDanaCustomer } from "../middleware/danaCustomerMiddleware.js";

const router = express.Router();

router.post("/create", verifyDanaCustomer, createPayment);

export default router;
