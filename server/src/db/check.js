import prisma from "./prisma.js";

async function checkDatabase() {
  const userCount = await prisma.user.count();
  const recipeCount = await prisma.recipe.count();
  const componentCount = await prisma.recipeComponent.count();

  console.table({
    users: userCount,
    recipes: recipeCount,
    recipe_components: componentCount,
  });

  const users = await prisma.user.findMany({
    select: {
      email: true,
      role: true,
    },
  });

  console.table(users);
}

checkDatabase()
  .catch((error) => {
    console.error("Database check failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });