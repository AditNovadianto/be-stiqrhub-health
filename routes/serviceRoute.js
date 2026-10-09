import { Router } from "express";
import { uploadService } from "../middleware/uploadService.js";
import {
  createService,
  deleteService,
  getAllServices,
  getServiceById,
  getServicesByProvider,
  getServicesByProviderCategory,
  updateService,
} from "../controllers/serviceController.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();

router.post("/service/create", verifyToken, uploadService, createService);
router.get("/service/get-all", getAllServices);
router.get("/service/provider/:id_provider", getServicesByProvider);
router.get("/service/:id", getServiceById);
router.get(
  "/service/provider-category/:id_provider_category",
  getServicesByProviderCategory,
);
router.patch("/service/:id", verifyToken, uploadService, updateService);
router.delete("/service/:id", verifyToken, deleteService);

export default router;
