import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const passwordHash = await bcrypt.hash("Demo@12345", 12);

  const supervisor = await prisma.user.upsert({
    where: {
      email: "supervisor@apparelflow.demo",
    },
    update: {},
    create: {
      email: "supervisor@apparelflow.demo",
      fullName: "Nimal Perera",
      passwordHash,
      role: "cutting_supervisor",
    },
  });

  const verifier = await prisma.user.upsert({
    where: {
      email: "verifier@apparelflow.demo",
    },
    update: {},
    create: {
      email: "verifier@apparelflow.demo",
      fullName: "Kavindi Silva",
      passwordHash,
      role: "cutting_verifier",
    },
  });

  const sewingSupervisor = await prisma.user.upsert({
    where: {
      email: "sewing@apparelflow.demo",
    },
    update: {},
    create: {
      email: "sewing@apparelflow.demo",
      fullName: "Sahan Fernando",
      passwordHash,
      role: "sewing_supervisor",
    },
  });

  const casualBlouse = await prisma.recipe.upsert({
    where: {
      recipeCode: "REC-BL01",
    },
    update: {
      name: "Casual Blouse",
      category: "Blouse",
      stdFabricYards: 1.8,
      wastageCap: 5.0,
    },
    create: {
      recipeCode: "REC-BL01",
      name: "Casual Blouse",
      category: "Blouse",
      stdFabricYards: 1.8,
      wastageCap: 5.0,
    },
  });

  const cropTop = await prisma.recipe.upsert({
    where: {
      recipeCode: "REC-CT02",
    },
    update: {
      name: "Crop Top",
      category: "Crop Top",
      stdFabricYards: 1.1,
      wastageCap: 8.0,
    },
    create: {
      recipeCode: "REC-CT02",
      name: "Crop Top",
      category: "Crop Top",
      stdFabricYards: 1.1,
      wastageCap: 8.0,
    },
  });

  const casualBlouseComponents = [
    { componentName: "Front Body Panel", piecesPerGarment: 1 },
    { componentName: "Back Body Panel", piecesPerGarment: 1 },
    { componentName: "Sleeves (Left & Right)", piecesPerGarment: 2 },
    { componentName: "Collar & Stand", piecesPerGarment: 1 },
    { componentName: "Sleeve Cuffs", piecesPerGarment: 2 },
  ];

  const cropTopComponents = [
    { componentName: "Front Chest Panel", piecesPerGarment: 1 },
    { componentName: "Back Support Panel", piecesPerGarment: 1 },
    { componentName: "Neck Binding Strip", piecesPerGarment: 1 },
    { componentName: "Hem Elastic Casing", piecesPerGarment: 1 },
    { componentName: "Side Strap Accents", piecesPerGarment: 2 },
  ];

  for (const component of casualBlouseComponents) {
    await prisma.recipeComponent.upsert({
      where: {
        recipeId_componentName: {
          recipeId: casualBlouse.id,
          componentName: component.componentName,
        },
      },
      update: {
        piecesPerGarment: component.piecesPerGarment,
      },
      create: {
        recipeId: casualBlouse.id,
        componentName: component.componentName,
        piecesPerGarment: component.piecesPerGarment,
      },
    });
  }

  for (const component of cropTopComponents) {
    await prisma.recipeComponent.upsert({
      where: {
        recipeId_componentName: {
          recipeId: cropTop.id,
          componentName: component.componentName,
        },
      },
      update: {
        piecesPerGarment: component.piecesPerGarment,
      },
      create: {
        recipeId: cropTop.id,
        componentName: component.componentName,
        piecesPerGarment: component.piecesPerGarment,
      },
    });
  }

  console.log("Seed completed successfully.");
  console.log(`Supervisor: ${supervisor.email}`);
  console.log(`Verifier: ${verifier.email}`);
  console.log(`Sewing Supervisor: ${sewingSupervisor.email}`);
  console.log("Recipes: REC-BL01 and REC-CT02");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });