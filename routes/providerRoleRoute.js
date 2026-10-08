import { Router } from "express";

import { verifyToken } from "../middleware/auth.js";

import {
  createProviderRole,
  deleteProviderRole,
  getAllProviderRoles,
  getProviderRoleById,
  updateProviderRole,
} from "../controllers/providerRoleController.js";

const router = Router();

// CREATE
router.post("/provider-role/create", verifyToken, createProviderRole);

// GET ALL
router.get("/provider-role/get-all", getAllProviderRoles);

// GET BY ID
router.get("/provider-role/:id", getProviderRoleById);

// UPDATE
router.patch("/provider-role/:id", verifyToken, updateProviderRole);

// DELETE
router.delete("/provider-role/:id", verifyToken, deleteProviderRole);

export default router;
