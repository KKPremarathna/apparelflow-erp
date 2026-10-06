import { Router } from "express";
import {
  createOrder,
  getOrders,
  getOrderById,
} from "../controllers/orderController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("cutting_supervisor"));

router.post("/", createOrder);
router.get("/", getOrders);
router.get("/:id", getOrderById);

export default router;