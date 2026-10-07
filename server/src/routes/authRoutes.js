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


export default router;