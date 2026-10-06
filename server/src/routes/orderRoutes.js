import { Router } from "express";
import { createOrder } from "../controllers/orderController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  requireRole("cutting_supervisor"),
  createOrder
);

export default router;