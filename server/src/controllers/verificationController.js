import prisma from "../db/prisma.js";

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