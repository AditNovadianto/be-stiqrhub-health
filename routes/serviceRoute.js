import { Router } from "express";
import { uploadService } from "../middleware/uploadService.js";
import {
  createService,
  deleteService,
  getAllServices,
  getServiceById,
  getServicesByProvider,
  updateService,
} from "../controllers/serviceController.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();

router.post("/service/create", verifyToken, uploadService, createService);
router.get("/service/get-all", verifyToken, getAllServices);
router.get(
  "/service/provider/:id_provider",
  verifyToken,
  getServicesByProvider,
);
router.get("/service/:id", verifyToken, getServiceById);
router.patch("/service/:id", verifyToken, uploadService, updateService);
router.delete("/service/:id", verifyToken, deleteService);

export default router;
