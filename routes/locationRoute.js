import { Router } from "express";

import { reverseGeocode } from "../controllers/locationController.js";

const router = Router();

// PUBLIC ROUTE
router.get("/location/reverse-geocode", reverseGeocode);

export default router;
