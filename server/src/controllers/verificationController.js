import prisma from "../db/prisma.js";
import { recordActivity } from "../services/activityService.js";

export async function getPendingOrders(req, res) {
  try {
    const orders = await prisma.cuttingOrder.findMany({
      where: {
        status: "PENDING_VERIFICATION",
      },
      select: {
        id: true,
        orderNo: true,
        targetQty: true,
        fabricRollId: true,
        actualFabricYds: true,
        status: true,
        createdAt: true,

        recipe: {
          select: {
            id: true,
            recipeCode: true,
            name: true,
          },
        },

        creator: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
    });

    return res.status(200).json({
      orders,
    });
  } catch (error) {
    console.error("Fetch pending orders failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch pending verification orders.",
    });
  }
}

export async function getVerificationOrderById(req, res) {
  try {
    const { orderId } = req.params;

    const order = await prisma.cuttingOrder.findFirst({
      where: {
        id: orderId,
        status: "PENDING_VERIFICATION",
      },
      include: {
        recipe: true,

        creator: {
          select: {
            id: true,
            fullName: true,
          },
        },

        verificationItems: {
          orderBy: {
            componentId: "asc",
          },
          include: {
            component: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        message: "Pending verification order not found.",
      });
    }

    return res.status(200).json({
      order,
    });
  } catch (error) {
    console.error("Fetch verification details failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch verification details.",
    });
  }
}

export async function updateVerificationItem(req, res) {
  try {
    const { itemId } = req.params;
    const body = req.body ?? {};
    const { actualQty } = body;

    // Only actualQty is accepted.
    if (
      Object.keys(body).some((key) => key !== "actualQty")
    ) {
      return res.status(400).json({
        message: "Only actualQty can be updated.",
      });
    }

    if (
      !Number.isSafeInteger(actualQty) ||
      actualQty < 0 ||
      actualQty > 2147483647
    ) {
      return res.status(400).json({
        message:
          "Actual quantity must be a non-negative whole number within the supported range.",
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const item = await tx.verificationItem.findUnique({
          where: {
            id: itemId,
          },
          include: {
            order: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        });

        if (!item) {
          return {
            statusCode: 404,
            message: "Verification item not found.",
          };
        }

        if (item.order.status !== "PENDING_VERIFICATION") {
          return {
            statusCode: 409,
            message:
              "Counts can only be changed for pending verification orders.",
          };
        }

        let status = "GREEN";

        if (actualQty < item.expectedQty) {
          status = "RED";
        } else if (actualQty > item.expectedQty) {
          status = "YELLOW";
        }

        // Touch the parent order to coordinate concurrent changes.
        const orderUpdate = await tx.cuttingOrder.updateMany({
          where: {
            id: item.orderId,
            status: "PENDING_VERIFICATION",
          },
          data: {
            updatedAt: new Date(),
          },
        });

        if (orderUpdate.count !== 1) {
          return {
            statusCode: 409,
            message: "Order state changed. Refresh and try again.",
          };
        }

        const updatedItem = await tx.verificationItem.update({
          where: {
            id: item.id,
          },
          data: {
            actualQty,
            status,
          },
          include: {
            component: true,
          },
        });
        await recordActivity(tx, {
          user: req.user,
          action: "COMPONENT_COUNT_UPDATED",
          orderId: item.orderId,
          metadata: {
            itemId: item.id,
            componentId: item.componentId,
            componentName: updatedItem.component.componentName,
            expectedQty: item.expectedQty,
            previousActualQty: item.actualQty,
            newActualQty: actualQty,
            previousStatus: item.status,
            newStatus: status,
          },
        });


        return {
          statusCode: 200,
          item: updatedItem,
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
      message: "Component count updated successfully.",
      item: result.item,
    });
  } catch (error) {
    if (error.code === "P2034") {
      return res.status(409).json({
        message:
          "Another update occurred at the same time. Refresh and retry.",
      });
    }

    console.error("Update component count failed:", error.message);

    return res.status(500).json({
      message: "Unable to update component count.",
    });
  }
}

export async function approveVerificationOrder(req, res) {
  try {
    const { orderId } = req.params;

    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.cuttingOrder.findUnique({
          where: {
            id: orderId,
          },
          include: {
            recipe: {
              include: {
                components: true,
              },
            },
            verificationItems: {
              include: {
                component: true,
              },
            },
          },
        });

        if (!order) {
          return {
            statusCode: 404,
            message: "Order not found.",
          };
        }

        if (order.status !== "PENDING_VERIFICATION") {
          return {
            statusCode: 409,
            message: "Only pending verification orders can be approved.",
          };
        }

        // Every current recipe component must have exactly one verification item.
        if (
          order.recipe.components.length === 0 ||
          order.verificationItems.length !== order.recipe.components.length
        ) {
          return {
            statusCode: 422,
            message:
              "Approval blocked: verification records are incomplete.",
          };
        }

        const recipeComponentIds = new Set(
          order.recipe.components.map((component) => component.id)
        );

        const verificationComponentIds = new Set(
          order.verificationItems.map((item) => item.componentId)
        );

        const hasMissingComponent = [...recipeComponentIds].some(
          (componentId) => !verificationComponentIds.has(componentId)
        );

        const hasUnexpectedComponent = [...verificationComponentIds].some(
          (componentId) => !recipeComponentIds.has(componentId)
        );

        if (hasMissingComponent || hasUnexpectedComponent) {
          return {
            statusCode: 422,
            message:
              "Approval blocked: verification components do not match the recipe.",
          };
        }

        const hasUncountedComponent = order.verificationItems.some(
          (item) => item.actualQty === null
        );

        if (hasUncountedComponent) {
          return {
            statusCode: 422,
            message:
              "Approval blocked: every component must be counted.",
          };
        }

        const hasShortage = order.verificationItems.some(
          (item) => item.actualQty < item.expectedQty
        );

        if (hasShortage) {
          return {
            statusCode: 422,
            message:
              "Approval blocked: component shortages exist.",
          };
        }

        // Server recomputes statuses; client input is never trusted.
        const snapshot = order.verificationItems.map((item) => {
          let status = "GREEN";

          if (item.actualQty < item.expectedQty) {
            status = "RED";
          } else if (item.actualQty > item.expectedQty) {
            status = "YELLOW";
          }

          return {
            componentId: item.componentId,
            componentName: item.component.componentName,
            expectedQty: item.expectedQty,
            actualQty: item.actualQty,
            varianceQty: item.actualQty - item.expectedQty,
            status,
          };
        });

        const expectedFabric =
          Number(order.recipe.stdFabricYards) * order.targetQty;

        const wastagePct =
          ((Number(order.actualFabricYds) - expectedFabric) /
            expectedFabric) *
          100;

        // Conditional update prevents duplicate/concurrent approval.
        const orderUpdate = await tx.cuttingOrder.updateMany({
          where: {
            id: order.id,
            status: "PENDING_VERIFICATION",
          },
          data: {
            status: "VERIFIED",
          },
        });

        if (orderUpdate.count !== 1) {
          return {
            statusCode: 409,
            message: "Order state changed. Refresh and try again.",
          };
        }

        const auditLog = await tx.verificationLog.create({
          data: {
            orderId: order.id,
            verifierId: req.user.id,
            decision: "APPROVED",
            rejectionNote: null,
            wastagePct: wastagePct.toFixed(2),
            componentSnapshot: snapshot,
          },
          select: {
            id: true,
            decision: true,
            wastagePct: true,
            componentSnapshot: true,
            createdAt: true,
          },
        });

        await recordActivity(tx, {
          user: req.user,
          action: "BATCH_APPROVED",
          orderId: order.id,
          metadata: {
            orderNo: order.orderNo,
            previousStatus: order.status,
            newStatus: "VERIFIED",
            verificationLogId: auditLog.id,
            wastagePct: auditLog.wastagePct?.toString() ?? null,
            
          },
        });

        return {
          statusCode: 200,
          orderId: order.id,
          auditLog,
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
      message: "Batch approved and released to Sewing Queue.",
      orderId: result.orderId,
      auditLog: result.auditLog,
    });
  } catch (error) {
    if (error.code === "P2034") {
      return res.status(409).json({
        message:
          "Another verification action occurred at the same time. Refresh and try again.",
      });
    }

    console.error("Approve verification order failed:", error.message);

    return res.status(500).json({
      message: "Unable to approve batch.",
    });
  }
}

export async function rejectVerificationOrder(req, res) {
  try {
    const { orderId } = req.params;
    const body = req.body ?? {};
    const { rejectionNote } = body;

    if (
      Object.keys(body).some((key) => key !== "rejectionNote")
    ) {
      return res.status(400).json({
        message: "Only rejectionNote is accepted.",
      });
    }

    if (
      typeof rejectionNote !== "string" ||
      rejectionNote.trim().length === 0 ||
      rejectionNote.trim().length > 2000
    ) {
      return res.status(400).json({
        message: "Rejection reason must contain 1 to 2000 characters.",
      });
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.cuttingOrder.findUnique({
          where: {
            id: orderId,
          },
          include: {
            recipe: {
              include: {
                components: true,
              },
            },
            verificationItems: {
              include: {
                component: true,
              },
            },
          },
        });

        if (!order) {
          return {
            statusCode: 404,
            message: "Order not found.",
          };
        }

        if (order.status !== "PENDING_VERIFICATION") {
          return {
            statusCode: 409,
            message: "Only pending verification orders can be rejected.",
          };
        }

        const requiredComponentIds = new Set(
          order.recipe.components.map((component) => component.id)
        );

        const itemComponentIds = new Set(
          order.verificationItems.map((item) => item.componentId)
        );

        const hasIncompleteRecords =
          requiredComponentIds.size === 0 ||
          order.verificationItems.length !== requiredComponentIds.size ||
          itemComponentIds.size !== requiredComponentIds.size ||
          [...requiredComponentIds].some(
            (componentId) => !itemComponentIds.has(componentId)
          );

        if (hasIncompleteRecords) {
          return {
            statusCode: 422,
            message:
              "Rejection blocked: verification records do not match all recipe components.",
          };
        }

        const hasInvalidOrMissingCount = order.verificationItems.some(
          (item) =>
            !Number.isSafeInteger(item.actualQty) ||
            item.actualQty < 0 ||
            item.actualQty > 2147483647
        );

        if (hasInvalidOrMissingCount) {
          return {
            statusCode: 422,
            message:
              "Rejection blocked: count and save every component before rejecting.",
          };
        }

        const snapshot = order.verificationItems.map((item) => {
          let status = null;

          if (item.actualQty !== null) {
            if (item.actualQty < item.expectedQty) {
              status = "RED";
            } else if (item.actualQty > item.expectedQty) {
              status = "YELLOW";
            } else {
              status = "GREEN";
            }
          }

          return {
            componentId: item.componentId,
            componentName: item.component.componentName,
            expectedQty: item.expectedQty,
            actualQty: item.actualQty,
            varianceQty:
              item.actualQty === null
                ? null
                : item.actualQty - item.expectedQty,
            status,
          };
        });

        const expectedFabric =
          Number(order.recipe.stdFabricYards) * order.targetQty;

        if (!Number.isFinite(expectedFabric) || expectedFabric <= 0) {
          return {
            statusCode: 409,
            message: "Order has invalid fabric requirements.",
          };
        }

        const wastagePct =
          ((Number(order.actualFabricYds) - expectedFabric) /
            expectedFabric) *
          100;

        const orderUpdate = await tx.cuttingOrder.updateMany({
          where: {
            id: order.id,
            status: "PENDING_VERIFICATION",
          },
          data: {
            status: "REJECTED",
          },
        });

        if (orderUpdate.count !== 1) {
          return {
            statusCode: 409,
            message: "Order state changed. Refresh and try again.",
          };
        }

        const auditLog = await tx.verificationLog.create({
          data: {
            orderId: order.id,
            verifierId: req.user.id,
            decision: "REJECTED",
            rejectionNote: rejectionNote.trim(),
            wastagePct: wastagePct.toFixed(2),
            componentSnapshot: snapshot,
          },
          select: {
            id: true,
            decision: true,
            rejectionNote: true,
            wastagePct: true,
            componentSnapshot: true,
            createdAt: true,
          },
        });

        await recordActivity(tx, {
          user: req.user,
          action: "BATCH_REJECTED",
          orderId: order.id,
          metadata: {
            orderNo: order.orderNo,
            previousStatus: order.status,
            newStatus: "REJECTED",
            verificationLogId: auditLog.id,
            wastagePct: auditLog.wastagePct?.toString() ?? null,
            rejectionNote: rejectionNote.trim(),
          },
        });

        return {
          statusCode: 200,
          orderId: order.id,
          auditLog,
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
      message: "Batch rejected and returned for correction.",
      orderId: result.orderId,
      status: "REJECTED",
      auditLog: result.auditLog,
    });
  } catch (error) {
    if (error.code === "P2034") {
      return res.status(409).json({
        message:
          "Another verification action occurred at the same time. Refresh and retry.",
      });
    }

    console.error("Reject batch failed:", error.message);

    return res.status(500).json({
      message: "Unable to reject batch.",
    });
  }
}

