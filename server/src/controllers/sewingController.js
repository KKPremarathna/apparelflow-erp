import prisma from "../db/prisma.js";

export async function getSewingQueue(req, res) {
  try {
    const orders = await prisma.cuttingOrder.findMany({
      where: {
        status: "VERIFIED",
      },
      select: {
        id: true,
        orderNo: true,
        targetQty: true,
        fabricRollId: true,
        actualFabricYds: true,
        status: true,
        updatedAt: true,

        recipe: {
          select: {
            id: true,
            recipeCode: true,
            name: true,
          },
        },

        verificationLogs: {
          where: {
            decision: "APPROVED",
          },
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
          take: 1,
          select: {
            id: true,
            verifierId: true,
            createdAt: true,
            wastagePct: true,
            componentSnapshot: true,

            verifier: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: [
        { updatedAt: "asc" },
        { id: "asc" },
      ],
    });

    return res.status(200).json({
      orders,
    });
  } catch (error) {
    console.error("Fetch sewing queue failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch sewing queue.",
    });
  }
}

export async function getSewingBatchById(req, res) {
  try {
    const { orderId } = req.params;

    const order = await prisma.cuttingOrder.findFirst({
      where: {
        id: orderId,
        status: {
          in: ["VERIFIED", "SEWING_IN_PROGRESS"],
        },
        verificationLogs: {
          some: {
            decision: "APPROVED",
          },
        },
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
            category: true,
          },
        },

        verificationLogs: {
          where: {
            decision: "APPROVED",
          },
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
          take: 1,
          select: {
            id: true,
            verifierId: true,
            decision: true,
            createdAt: true,
            wastagePct: true,
            componentSnapshot: true,

            verifier: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        message: "Released sewing batch not found.",
      });
    }

    return res.status(200).json({
      order,
    });
  } catch (error) {
    console.error("Fetch sewing batch failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch sewing batch details.",
    });
  }
}

export async function startSewing(req, res) {
  try {
    const { orderId } = req.params;

    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.cuttingOrder.findFirst({
          where: {
            id: orderId,
            status: {
              in: ["VERIFIED", "SEWING_IN_PROGRESS"],
            },
            verificationLogs: {
              some: {
                decision: "APPROVED",
              },
            },
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (!order) {
          return {
            statusCode: 404,
            message: "Released sewing batch not found.",
          };
        }

        if (order.status === "SEWING_IN_PROGRESS") {
          return {
            statusCode: 409,
            message: "Sewing assembly has already started.",
          };
        }

        const update = await tx.cuttingOrder.updateMany({
          where: {
            id: order.id,
            status: "VERIFIED",
            verificationLogs: {
              some: {
                decision: "APPROVED",
              },
            },
          },
          data: {
            status: "SEWING_IN_PROGRESS",
          },
        });

        if (update.count !== 1) {
          return {
            statusCode: 409,
            message: "Order state changed. Refresh and retry.",
          };
        }

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
      message: "Sewing assembly started successfully.",
      orderId: result.orderId,
      status: "SEWING_IN_PROGRESS",
    });
  } catch (error) {
    if (error.code === "P2034") {
      return res.status(409).json({
        message:
          "Another action occurred at the same time. Refresh and retry.",
      });
    }

    console.error("Start sewing failed:", error.message);

    return res.status(500).json({
      message: "Unable to start sewing assembly.",
    });
  }
}