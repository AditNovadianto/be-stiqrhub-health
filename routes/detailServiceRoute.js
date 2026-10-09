import { Router } from "express";

import {
  createDetailService,
  deleteDetailService,
  getAllDetailServices,
  getDetailServiceById,
  getDetailServicesByService,
  updateDetailService,
} from "../controllers/detailServiceController.js";

import { verifyToken } from "../middleware/auth.js";

const router = Router();

router.post("/detail-service/create", verifyToken, createDetailService);
router.get("/detail-service/get-all", getAllDetailServices);
router.get("/detail-service/service/:id_service", getDetailServicesByService);
router.get("/detail-service/:id", getDetailServiceById);
router.patch("/detail-service/:id", verifyToken, updateDetailService);
router.delete("/detail-service/:id", verifyToken, deleteDetailService);

export default router;
