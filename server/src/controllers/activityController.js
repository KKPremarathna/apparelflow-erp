import prisma from "../db/prisma.js";

export async function getMyActivity(req, res) {
  // This initial version accepts no query parameters.
  // Users cannot request another actor's records.
  if (Object.keys(req.query).length > 0) {
    return res.status(400).json({
      message: "Query parameters are not supported.",
    });
  }

  try {
    const activities = await prisma.activityLog.findMany({
      where: {
        actorId: req.user.id,
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: 50,
      select: {
        id: true,
        actorId: true,
        actorRole: true,
        action: true,
        orderId: true,
        metadata: true,
        createdAt: true,
        order: {
          select: {
            orderNo: true,
          },
        },
      },
    });

    return res.status(200).json({
      activities,
    });
  } catch (error) {
    console.error("Fetch activity history failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch your activity history.",
    });
  }
}