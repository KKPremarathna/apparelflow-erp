import { Router } from "express";
import {
  getPendingOrders,
  getVerificationOrderById,
  updateVerificationItem,
  approveVerificationOrder,
  rejectVerificationOrder,
} from "../controllers/verificationController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("cutting_verifier"));

router.get("/pending", getPendingOrders);
router.get("/orders/:orderId", getVerificationOrderById);
router.patch("/items/:itemId", updateVerificationItem);
router.post("/orders/:orderId/approve",approveVerificationOrder);
router.post("/orders/:orderId/reject",rejectVerificationOrder);

export default router;