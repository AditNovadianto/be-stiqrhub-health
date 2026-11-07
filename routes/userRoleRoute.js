import { Router } from "express";

import { verifyToken } from "../middleware/auth.js";

import {
  createUserRole,
  deleteUserRole,
  getAllUserRoles,
  getUserRoleById,
  updateUserRole,
} from "../controllers/userRoleController.js";

const router = Router();

// CREATE
router.post("/user-role/create", verifyToken, createUserRole);

// GET ALL
router.get("/user-role/get-all", getAllUserRoles);

// GET BY ID
router.get("/user-role/:id", getUserRoleById);

// UPDATE
router.patch("/user-role/:id", verifyToken, updateUserRole);

// DELETE
router.delete("/user-role/:id", verifyToken, deleteUserRole);

export default router;
