import { Router } from "express";
import {
  login,
  getMe,
  logout,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.post("/login", login);
router.get("/me", requireAuth, getMe);
router.post("/logout", logout);

// Temporary route for testing role permissions.
router.get(
  "/supervisor-check",
  requireAuth,
  requireRole("cutting_supervisor"),
  (req, res) => {
    return res.status(200).json({
      message: "Cutting Supervisor access allowed.",
      user: req.user,
    });
  }
);

export default router;