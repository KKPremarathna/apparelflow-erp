import prisma from "../db/prisma.js";

export async function getRecipes(req, res) {
  try {
    const recipes = await prisma.recipe.findMany({
      include: {
        components: true,
      },
      orderBy: {
        recipeCode: "asc",
      },
    });

    return res.status(200).json({
      recipes,
    });
  } catch (error) {
    console.error("Failed to fetch recipes:", error.message);

    return res.status(500).json({
      message: "Unable to fetch recipes.",
    });
  }
}

export async function getRecipeById(req, res) {
  try {
    const { id } = req.params;

    const recipe = await prisma.recipe.findUnique({
      where: {
        id,
      },
      include: {
        components: true,
      },
    });

    if (!recipe) {
      return res.status(404).json({
        message: "Recipe not found.",
      });
    }

    return res.status(200).json({
      recipe,
    });
  } catch (error) {
    console.error("Failed to fetch recipe:", error.message);

    return res.status(500).json({
      message: "Unable to fetch recipe.",
    });
  }
}