import "dotenv/config";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from "vitest";

import app from "../src/app.js";
import prisma from "../src/db/prisma.js";

const supervisor = request.agent(app);
const verifier = request.agent(app);
const sewing = request.agent(app);

let recipeId;

async function login(agent, email) {
  await agent
    .post("/api/auth/login")
    .send({
      email,
      password: "Demo@12345",
    })
    .expect(200);
}

async function createBatch() {
  const response = await supervisor
    .post("/api/orders")
    .send({
      recipeId,
      targetQty: 50,
      fabricRollId: `TEST-${randomUUID()}`,
      actualFabricYds: 92,
    })
    .expect(201);

  return response.body.order;
}

async function saveCounts(order, shortage = false) {
  for (let index = 0; index < order.verificationItems.length; index++) {
    const item = order.verificationItems[index];

    const actualQty =
      shortage && index === 0
        ? item.expectedQty - 1
        : item.expectedQty;

    await verifier
      .patch(`/api/verification/items/${item.id}`)
      .send({ actualQty })
      .expect(200);
  }
}

describe("Verification workflow integration tests", () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("Workflow tests require NODE_ENV=test.");
    }

    await login(supervisor, "supervisor@apparelflow.demo");
    await login(verifier, "verifier@apparelflow.demo");
    await login(sewing, "sewing@apparelflow.demo");

    const response = await supervisor
      .get("/api/recipes")
      .expect(200);

    const recipe = response.body.recipes.find(
      (item) => item.recipeCode === "REC-BL01"
    );

    if (!recipe) {
      throw new Error("Casual Blouse recipe missing. Run test database seed.");
    }

    recipeId = recipe.id;
  });

  it("allows a verifier to approve an all-GREEN batch", async () => {
    const order = await createBatch();
    await saveCounts(order);

    const response = await verifier
      .post(`/api/verification/orders/${order.id}/approve`)
      .expect(200);

    expect(response.body.auditLog.decision).toBe("APPROVED");

    const storedOrder = await prisma.cuttingOrder.findUnique({
      where: { id: order.id },
      include: { verificationLogs: true },
    });

    expect(storedOrder.status).toBe("VERIFIED");
    expect(storedOrder.verificationLogs).toHaveLength(1);

    const log = storedOrder.verificationLogs[0];

    expect(log.componentSnapshot).toHaveLength(
      order.verificationItems.length
    );

    expect(
      log.componentSnapshot.every(
        (item) => item.status === "GREEN"
      )
    ).toBe(true);

    const verifierUser = await prisma.user.findUnique({
      where: { email: "verifier@apparelflow.demo" },
    });

    expect(log.verifierId).toBe(verifierUser.id);
  });

  it("blocks approval when a component has a shortage", async () => {
    const order = await createBatch();
    await saveCounts(order, true);

    await verifier
      .post(`/api/verification/orders/${order.id}/approve`)
      .expect(422);

    const storedOrder = await prisma.cuttingOrder.findUnique({
      where: { id: order.id },
      include: { verificationLogs: true },
    });

    expect(storedOrder.status).toBe("PENDING_VERIFICATION");
    expect(storedOrder.verificationLogs).toHaveLength(0);
  });

  it("blocks rejection without a reason", async () => {
    const order = await createBatch();
    await saveCounts(order);

    await verifier
      .post(`/api/verification/orders/${order.id}/reject`)
      .send({ rejectionNote: "   " })
      .expect(400);

    const storedOrder = await prisma.cuttingOrder.findUnique({
      where: { id: order.id },
      include: { verificationLogs: true },
    });

    expect(storedOrder.status).toBe("PENDING_VERIFICATION");
    expect(storedOrder.verificationLogs).toHaveLength(0);
  });

  it("returns 403 for non-verifier approval requests", async () => {
    const order = await createBatch();
    await saveCounts(order);

    for (const agent of [supervisor, sewing]) {
      await agent
        .post(`/api/verification/orders/${order.id}/approve`)
        .expect(403);
    }

    const storedOrder = await prisma.cuttingOrder.findUnique({
      where: { id: order.id },
    });

    expect(storedOrder.status).toBe("PENDING_VERIFICATION");
  });

  it("returns only VERIFIED batches in the sewing queue", async () => {
    const pendingOrder = await createBatch();

    const rejectedOrder = await createBatch();
    await saveCounts(rejectedOrder, true);

    await verifier
      .post(`/api/verification/orders/${rejectedOrder.id}/reject`)
      .send({
        rejectionNote: "A component is short by one piece.",
      })
      .expect(200);

    const verifiedOrder = await createBatch();
    await saveCounts(verifiedOrder);

    await verifier
      .post(`/api/verification/orders/${verifiedOrder.id}/approve`)
      .expect(200);

    // Attempts to override the queue filter must not work.
    const response = await sewing
      .get("/api/sewing/queue?status=PENDING_VERIFICATION")
      .expect(200);

    const orders = response.body.orders;
    const ids = orders.map((order) => order.id);

    expect(ids).toContain(verifiedOrder.id);
    expect(ids).not.toContain(pendingOrder.id);
    expect(ids).not.toContain(rejectedOrder.id);

    expect(
      orders.every((order) => order.status === "VERIFIED")
    ).toBe(true);
  });



  it("blocks approval when component counts are missing", async () => {
    const order = await createBatch();

    await verifier
        .post(`/api/verification/orders/${order.id}/approve`)
        .expect(422);

    const storedOrder = await prisma.cuttingOrder.findUnique({
        where: { id: order.id },
        include: { verificationLogs: true },
    });

    expect(storedOrder.status).toBe("PENDING_VERIFICATION");
    expect(storedOrder.verificationLogs).toHaveLength(0);
    });

    it("blocks rejection when component counts are missing", async () => {
    const order = await createBatch();

    await verifier
        .post(`/api/verification/orders/${order.id}/reject`)
        .send({
        rejectionNote: "Needs correction.",
        })
        .expect(422);

    const storedOrder = await prisma.cuttingOrder.findUnique({
        where: { id: order.id },
        include: { verificationLogs: true },
    });

    expect(storedOrder.status).toBe("PENDING_VERIFICATION");
    expect(storedOrder.verificationLogs).toHaveLength(0);
    });

    it("resubmits a rejected batch and preserves its rejection audit", async () => {
    const order = await createBatch();
    await saveCounts(order, true);

    const rejection = await verifier
        .post(`/api/verification/orders/${order.id}/reject`)
        .send({
        rejectionNote: "Re-cut the missing component.",
        })
        .expect(200);

    const originalLog = await prisma.verificationLog.findUnique({
        where: {
        id: rejection.body.auditLog.id,
        },
    });

    expect(originalLog).not.toBeNull();

    await supervisor
        .post(`/api/orders/${order.id}/resubmit`)
        .send({
        actualFabricYds: 93,
        })
        .expect(200);

    const resubmittedOrder = await prisma.cuttingOrder.findUnique({
        where: { id: order.id },
        include: {
        verificationItems: true,
        verificationLogs: true,
        },
    });

    expect(resubmittedOrder.status).toBe("PENDING_VERIFICATION");
    expect(Number(resubmittedOrder.actualFabricYds)).toBe(93);

    expect(resubmittedOrder.verificationItems).toHaveLength(
        order.verificationItems.length
    );

    expect(
        resubmittedOrder.verificationItems.every(
        (item) => item.actualQty === null && item.status === null
        )
    ).toBe(true);

    const preservedLog = resubmittedOrder.verificationLogs.find(
        (log) => log.id === originalLog.id
    );

    expect(preservedLog).toBeDefined();
    expect(preservedLog.rejectionNote).toBe(originalLog.rejectionNote);
    expect(preservedLog.componentSnapshot).toEqual(
        originalLog.componentSnapshot
    );
    expect(preservedLog.verifierId).toBe(originalLog.verifierId);
    expect(preservedLog.createdAt).toEqual(originalLog.createdAt);
    expect(Number(preservedLog.wastagePct)).toBe(
        Number(originalLog.wastagePct)
    );

    // Fresh counts are required after resubmission.
    await verifier
        .post(`/api/verification/orders/${order.id}/approve`)
        .expect(422);
    });

    it("starts sewing once and removes the batch from the waiting queue", async () => {
    const order = await createBatch();
    await saveCounts(order);

    const approval = await verifier
        .post(`/api/verification/orders/${order.id}/approve`)
        .expect(200);

    const start = await sewing
        .post(`/api/sewing/orders/${order.id}/start`)
        .expect(200);

    expect(start.body.status).toBe("SEWING_IN_PROGRESS");

    await sewing
        .post(`/api/sewing/orders/${order.id}/start`)
        .expect(409);

    const queue = await sewing
        .get("/api/sewing/queue")
        .expect(200);

    expect(
        queue.body.orders.some((item) => item.id === order.id)
    ).toBe(false);

    const details = await sewing
        .get(`/api/sewing/orders/${order.id}`)
        .expect(200);

    expect(details.body.order.status).toBe("SEWING_IN_PROGRESS");

    const storedOrder = await prisma.cuttingOrder.findUnique({
        where: { id: order.id },
        include: { verificationLogs: true },
    });

    expect(storedOrder.status).toBe("SEWING_IN_PROGRESS");
    expect(storedOrder.verificationLogs).toHaveLength(1);
    expect(storedOrder.verificationLogs[0].id).toBe(
        approval.body.auditLog.id
    );
    });

    it("blocks updating an existing verification audit log", async () => {
        const order = await createBatch();
        await saveCounts(order);

        const approval = await verifier
            .post(`/api/verification/orders/${order.id}/approve`)
            .expect(200);

        const logId = approval.body.auditLog.id;

        const originalLog = await prisma.verificationLog.findUnique({
            where: { id: logId },
        });

        expect(originalLog).not.toBeNull();

        await expect(
            prisma.verificationLog.update({
            where: { id: logId },
            data: {
                wastagePct: "99.99",
            },
            })
        ).rejects.toThrow("Verification audit logs are immutable.");

        const preservedLog = await prisma.verificationLog.findUnique({
            where: { id: logId },
        });

        expect(preservedLog).not.toBeNull();
        expect(Number(preservedLog.wastagePct)).toBe(
            Number(originalLog.wastagePct)
        );
        expect(preservedLog.componentSnapshot).toEqual(
            originalLog.componentSnapshot
        );
        });

        it("blocks deleting an existing verification audit log", async () => {
        const order = await createBatch();
        await saveCounts(order, true);

        const rejection = await verifier
            .post(`/api/verification/orders/${order.id}/reject`)
            .send({
            rejectionNote: "Component shortage recorded for audit test.",
            })
            .expect(200);

        const logId = rejection.body.auditLog.id;

        const originalLog = await prisma.verificationLog.findUnique({
            where: { id: logId },
        });

        expect(originalLog).not.toBeNull();

        await expect(
            prisma.verificationLog.delete({
            where: { id: logId },
            })
        ).rejects.toThrow("Verification audit logs are immutable.");

        const preservedLog = await prisma.verificationLog.findUnique({
            where: { id: logId },
        });

        expect(preservedLog).not.toBeNull();
        expect(preservedLog.decision).toBe("REJECTED");
        expect(preservedLog.rejectionNote).toBe(originalLog.rejectionNote);
        expect(preservedLog.componentSnapshot).toEqual(
            originalLog.componentSnapshot
        );
        });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});