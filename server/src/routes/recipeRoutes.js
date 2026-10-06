import { Router } from "express";
import {
  getRecipes,
  getRecipeById,
} from "../controllers/recipeController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("cutting_supervisor"));

router.get("/", getRecipes);
router.get("/:id", getRecipeById);

export default router;