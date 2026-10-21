import express from "express";
import { verifyToken } from "../middleware/auth.js";

import {
  createGuest,
  getAllGuests,
  getGuestById,
} from "../controllers/guestController.js";

const router = express.Router();

// Create guest untuk customer yang sedang login
router.post("/guest/create", verifyToken, createGuest);

// Get seluruh guest milik customer yang sedang login
router.get("/guest/get-all", verifyToken, getAllGuests);

// Get detail guest milik customer yang sedang login
router.get("/guest/:id_guest", verifyToken, getGuestById);

export default router;
