import { randomUUID } from "node:crypto";
import prisma from "../db/prisma.js";
import {
  recordActivity,
} from "../services/activityService.js";

function isValidFabricUsage(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 99999999.99 &&
    Number.isSafeInteger(
      Number((value * 100).toFixed(8))
    )
  );
}

export async function createOrder(req, res) {
  try {
    const {
      recipeId,
      targetQty,
      fabricRollId,
      actualFabricYds,
    } = req.body ?? {};

    if (
      typeof recipeId !== "string" ||
      recipeId.trim() === ""
    ) {
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

    if (!isValidFabricUsage(actualFabricYds)) {
      return res.status(400).json({
        message:
          "Actual fabric usage must be positive with at most 2 decimal places.",
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const recipe = await tx.recipe.findUnique({
          where: {
            id: recipeId.trim(),
          },
          include: {
            components: true,
          },
        });

        if (!recipe) {
          return {
            statusCode: 404,
            message: "Recipe not found.",
          };
        }

        if (recipe.components.length === 0) {
          return {
            statusCode: 409,
            message: "This recipe has no components.",
          };
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
          return {
            statusCode: 400,
            message:
              "Batch quantity exceeds supported component counts.",
          };
        }

        const order = await tx.cuttingOrder.create({
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

        await recordActivity(tx, {
          user: req.user,
          action: "ORDER_CREATED",
          orderId: order.id,
          metadata: {
            orderNo: order.orderNo,
            recipeId: recipe.id,
            recipeCode: recipe.recipeCode,
            recipeName: recipe.name,
            targetQty,
            fabricRollId: order.fabricRollId,
            actualFabricYds: actualFabricYds.toFixed(2),
            newStatus: order.status,
            componentCount: items.length,
          },
        });

        return {
          statusCode: 201,
          order,
        };
      },
      {
        isolationLevel: "Serializable",
      }
    );

    if (result.statusCode !== 201) {
      return res.status(result.statusCode).json({
        message: result.message,
      });
    }

    return res.status(201).json({
      message: "Cutting order created successfully.",
      order: result.order,
    });
  } catch (error) {
    if (error.code === "P2034") {
      return res.status(409).json({
        message:
          "Another update occurred at the same time. Refresh and retry.",
      });
    }

    console.error("Create order failed:", error.message);

    return res.status(500).json({
      message: "Unable to create cutting order.",
    });
  }
}

export async function getOrders(req, res) {
  try {
    const orders = await prisma.cuttingOrder.findMany({
      where: {
        createdBy: req.user.id,
      },
      select: {
        id: true,
        orderNo: true,
        targetQty: true,
        fabricRollId: true,
        actualFabricYds: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        recipe: {
          select: {
            id: true,
            recipeCode: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      orders,
    });
  } catch (error) {
    console.error("Fetch orders failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch cutting orders.",
    });
  }
}

export async function getOrderById(req, res) {
  try {
    const { id } = req.params;

    const order = await prisma.cuttingOrder.findFirst({
      where: {
        id,
        createdBy: req.user.id,
      },
      include: {
        recipe: true,

        verificationItems: {
          include: {
            component: true,
          },
        },

        verificationLogs: {
          orderBy: {
            createdAt: "desc",
          },
          include: {
            verifier: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found.",
      });
    }

    return res.status(200).json({
      order,
    });
  } catch (error) {
    console.error("Fetch order details failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch order details.",
    });
  }
}

export async function resubmitOrder(req, res) {
  try {
    const { id } = req.params;
    const body = req.body ?? {};
    const { actualFabricYds } = body;

    if (
      Object.keys(body).some(
        (key) => key !== "actualFabricYds"
      )
    ) {
      return res.status(400).json({
        message: "Only actualFabricYds is accepted.",
      });
    }

    if (!isValidFabricUsage(actualFabricYds)) {
      return res.status(400).json({
        message:
          "Total fabric usage must be positive with at most 2 decimal places.",
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.cuttingOrder.findFirst({
          where: {
            id,
            createdBy: req.user.id,
          },
        });

        if (!order) {
          return {
            statusCode: 404,
            message: "Order not found.",
          };
        }

        if (order.status !== "REJECTED") {
          return {
            statusCode: 409,
            message: "Only rejected orders can be resubmitted.",
          };
        }

        if (
          actualFabricYds < Number(order.actualFabricYds)
        ) {
          return {
            statusCode: 400,
            message:
              "Total fabric usage cannot be lower than the previously recorded usage.",
          };
        }

        const updated = await tx.cuttingOrder.updateMany({
          where: {
            id: order.id,
            createdBy: req.user.id,
            status: "REJECTED",
          },
          data: {
            status: "PENDING_VERIFICATION",
            actualFabricYds: actualFabricYds.toFixed(2),
          },
        });

        if (updated.count !== 1) {
          return {
            statusCode: 409,
            message: "Order state changed. Refresh and retry.",
          };
        }

        const reset = await tx.verificationItem.updateMany({
          where: {
            orderId: order.id,
          },
          data: {
            actualQty: null,
            status: null,
          },
        });

        await recordActivity(tx, {
          user: req.user,
          action: "ORDER_RESUBMITTED",
          orderId: order.id,
          metadata: {
            orderNo: order.orderNo,
            previousStatus: order.status,
            newStatus: "PENDING_VERIFICATION",
            previousActualFabricYds:
              order.actualFabricYds.toFixed(2),
            newActualFabricYds:
              actualFabricYds.toFixed(2),
            resetComponentCount: reset.count,
          },
        });

        return {
          statusCode: 200,
          orderId: order.id,
        };
      },
      {
        isolationLevel: "Serializable",
      }
    );

    if (result.statusCode !== 200) {
      return res.status(result.statusCode).json({
        message: result.message,
      });
    }

    return res.status(200).json({
      message:
        "Batch resubmitted. Every component must be counted again.",
      orderId: result.orderId,
      status: "PENDING_VERIFICATION",
    });
  } catch (error) {
    if (error.code === "P2034") {
      return res.status(409).json({
        message:
          "Another update occurred at the same time. Refresh and retry.",
      });
    }

    console.error("Resubmit order failed:", error.message);

    return res.status(500).json({
      message: "Unable to resubmit order.",
    });
  }
}