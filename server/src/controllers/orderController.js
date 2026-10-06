import { randomUUID } from "node:crypto";
import prisma from "../db/prisma.js";

export async function createOrder(req, res) {
  try {
    const {
      recipeId,
      targetQty,
      fabricRollId,
      actualFabricYds,
    } = req.body ?? {};

    if (typeof recipeId !== "string" || recipeId.trim() === "") {
      return res.status(400).json({
        message: "Recipe ID is required.",
      });
    }

    if (
      !Number.isSafeInteger(targetQty) ||
      targetQty <= 0
    ) {
      return res.status(400).json({
        message: "Target quantity must be a positive whole number.",
      });
    }

    if (
      typeof fabricRollId !== "string" ||
      fabricRollId.trim() === "" ||
      fabricRollId.trim().length > 100
    ) {
      return res.status(400).json({
        message: "Fabric roll ID must contain 1 to 100 characters.",
      });
    }

    if (
      typeof actualFabricYds !== "number" ||
      !Number.isFinite(actualFabricYds) ||
      actualFabricYds <= 0 ||
      actualFabricYds > 99999999.99 ||
      !Number.isSafeInteger(
        Number((actualFabricYds * 100).toFixed(8))
      )
    ) {
      return res.status(400).json({
        message:
          "Actual fabric usage must be positive with at most 2 decimal places.",
      });
    }

    const recipe = await prisma.recipe.findUnique({
      where: {
        id: recipeId.trim(),
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

    if (recipe.components.length === 0) {
      return res.status(409).json({
        message: "This recipe has no components.",
      });
    }

    const items = recipe.components.map((component) => ({
      componentId: component.id,
      expectedQty: component.piecesPerGarment * targetQty,
    }));

    const invalidExpectedCount = items.some(
      (item) =>
        !Number.isSafeInteger(item.expectedQty) ||
        item.expectedQty <= 0 ||
        item.expectedQty > 2147483647
    );

    if (invalidExpectedCount) {
      return res.status(400).json({
        message: "Batch quantity exceeds supported component counts.",
      });
    }

    const order = await prisma.cuttingOrder.create({
      data: {
        orderNo: `CUT-${randomUUID()}`,
        recipeId: recipe.id,
        targetQty,
        fabricRollId: fabricRollId.trim(),
        actualFabricYds: actualFabricYds.toFixed(2),
        status: "PENDING_VERIFICATION",
        createdBy: req.user.id,

        verificationItems: {
          create: items,
        },
      },
      include: {
        recipe: true,
        verificationItems: {
          include: {
            component: true,
          },
        },
      },
    });

    return res.status(201).json({
      message: "Cutting order created successfully.",
      order,
    });
  } catch (error) {
    console.error("Create order failed:", error.message);

    return res.status(500).json({
      message: "Unable to create cutting order.",
    });
  }
}