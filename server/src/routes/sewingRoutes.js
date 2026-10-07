import { Router } from "express";
import {
  getSewingQueue,
  getSewingBatchById,
  startSewing,
} from "../controllers/sewingController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("sewing_supervisor"));

router.get("/queue", getSewingQueue);
router.get("/orders/:orderId", getSewingBatchById);
router.post("/orders/:orderId/start", startSewing);

export default router;