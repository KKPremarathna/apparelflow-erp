import { Router } from "express";
import {
  getMyActivity,
} from "../controllers/activityController.js";
import {
  requireAuth,
} from "../middleware/authMiddleware.js";

const router = Router();

const allowedRoles = new Set([
  "cutting_supervisor",
  "cutting_verifier",
  "sewing_supervisor",
]);

router.use(requireAuth);

router.use((req, res, next) => {
  if (!allowedRoles.has(req.user.role)) {
    return res.status(403).json({
      message: "You are not allowed to access activity history.",
    });
  }

  return next();
});

router.get("/my", getMyActivity);

export default router;