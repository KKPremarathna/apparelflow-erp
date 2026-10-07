import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../src/app.js";
import prisma from "../src/db/prisma.js";
import { recordActivity } from "../src/services/activityService.js";

const supervisor = request.agent(app).set("X-CSRF-Protection", "1");
const verifier = request.agent(app).set("X-CSRF-Protection", "1");
const sewing = request.agent(app).set("X-CSRF-Protection", "1");
const otherSupervisor = request.agent(app).set("X-CSRF-Protection", "1");
let recipeId;
let users;
let otherUser;
let otherOrder;
let workflowOrder;

async function login(agent, email, password = "Demo@12345") {
  await agent.post("/api/auth/login").send({ email, password }).expect(200);
}

async function createBatch(agent = supervisor, extra = {}) {
  const response = await agent.post("/api/orders").send({
    recipeId, targetQty: 50, fabricRollId: `ACTIVITY-${randomUUID()}`,
    actualFabricYds: 92, ...extra,
  }).expect(201);
  return response.body.order;
}

async function saveCounts(order, shortage = false) {
  for (const [index, item] of order.verificationItems.entries()) {
    await verifier.patch(`/api/verification/items/${item.id}`).send({
      actualQty: shortage && index === 0 ? item.expectedQty - 1 : item.expectedQty,
    }).expect(200);
  }
}

async function activities(orderId) {
  return prisma.activityLog.findMany({ where: { orderId } });
}

describe("Private activity history", () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV !== "test") {
      throw new Error("Activity tests require NODE_ENV=test and the dedicated test database.");
    }
    await login(supervisor, "supervisor@apparelflow.demo");
    await login(verifier, "verifier@apparelflow.demo");
    await login(sewing, "sewing@apparelflow.demo");
    users = {};
    for (const [name, agent] of Object.entries({ supervisor, verifier, sewing })) {
      const response = await agent.get("/api/auth/me").expect(200);
      users[name] = response.body.user;
    }
    const recipes = await supervisor.get("/api/recipes").expect(200);
    recipeId = recipes.body.recipes.find((recipe) => recipe.recipeCode === "REC-BL01")?.id;
    if (!recipeId) throw new Error("Seed the test database before running activity tests.");
    const password = randomUUID();
    otherUser = await prisma.user.create({
      data: {
        email: `activity-${randomUUID()}@example.test`,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: "Activity Isolation Test User",
        role: "cutting_supervisor",
      },
    });
    await login(otherSupervisor, otherUser.email, password);
    otherOrder = await createBatch(otherSupervisor, {
      actorId: users.supervisor.id,
      actorRole: "sewing_supervisor",
    });
  }, 60000);

  it("records all six action types with authenticated actors and old/new count values", async () => {
    workflowOrder = await createBatch();
    await saveCounts(workflowOrder, true);
    await verifier.post(`/api/verification/orders/${workflowOrder.id}/reject`)
      .send({ rejectionNote: "Activity test: re-cut missing component." }).expect(200);
    await supervisor.post(`/api/orders/${workflowOrder.id}/resubmit`)
      .send({ actualFabricYds: 93 }).expect(200);
    await saveCounts(workflowOrder);
    await verifier.post(`/api/verification/orders/${workflowOrder.id}/approve`).expect(200);
    await sewing.post(`/api/sewing/orders/${workflowOrder.id}/start`).expect(200);

    const logs = await activities(workflowOrder.id);
    expect(new Set(logs.map((log) => log.action))).toEqual(new Set([
      "ORDER_CREATED", "ORDER_RESUBMITTED", "COMPONENT_COUNT_UPDATED",
      "BATCH_APPROVED", "BATCH_REJECTED", "SEWING_STARTED",
    ]));
    expect(logs.find((log) => log.action === "ORDER_CREATED").actorId).toBe(users.supervisor.id);
    expect(logs.find((log) => log.action === "ORDER_RESUBMITTED").metadata)
      .toMatchObject({ previousActualFabricYds: "92.00", newActualFabricYds: "93.00" });
    for (const action of ["BATCH_APPROVED", "BATCH_REJECTED", "COMPONENT_COUNT_UPDATED"]) {
      expect(logs.filter((log) => log.action === action).every((log) => log.actorId === users.verifier.id)).toBe(true);
    }
    const firstCount = logs.find((log) =>
      log.action === "COMPONENT_COUNT_UPDATED" &&
      log.metadata.itemId === workflowOrder.verificationItems[0].id &&
      log.metadata.newStatus === "RED"
    );
    expect(firstCount.metadata.previousActualQty).toBeNull();
    expect(firstCount.metadata.newActualQty).toBe(workflowOrder.verificationItems[0].expectedQty - 1);
    expect(logs.find((log) => log.action === "SEWING_STARTED").actorId).toBe(users.sewing.id);
    expect(logs.every((log) => log.createdAt instanceof Date)).toBe(true);
  }, 180000);

  it("requires authentication for history", async () => {
    await request(app).get("/api/activity/my").expect(401);
  });

  it("rejects actor and role query overrides", async () => {
    await supervisor.get(`/api/activity/my?actorId=${users.verifier.id}`).expect(400);
    await supervisor.get("/api/activity/my?role=cutting_verifier").expect(400);
  });

  it("returns only the authenticated actor's records across roles", async () => {
    for (const [name, agent] of Object.entries({ supervisor, verifier, sewing })) {
      const response = await agent.get("/api/activity/my").expect(200);
      expect(response.body.activities.length).toBeGreaterThan(0);
      expect(response.body.activities.every((log) => log.actorId === users[name].id)).toBe(true);
      expect(response.body.activities.length).toBeLessThanOrEqual(50);
    }
  });

  it("isolates two users of the same role and ignores supplied actor identities", async () => {
    const own = await otherSupervisor.get("/api/activity/my").expect(200);
    expect(own.body.activities).toHaveLength(1);
    expect(own.body.activities[0]).toMatchObject({
      actorId: otherUser.id, actorRole: "cutting_supervisor", orderId: otherOrder.id,
    });
    const first = await supervisor.get("/api/activity/my").expect(200);
    expect(first.body.activities.some((log) => log.orderId === otherOrder.id)).toBe(false);
  });

  it("does not record successful decisions for failed or duplicate actions", async () => {
    const pending = await createBatch();
    const before = (await activities(pending.id)).length;
    await verifier.post(`/api/verification/orders/${pending.id}/approve`).expect(422);
    await sewing.post(`/api/sewing/orders/${pending.id}/start`).expect(404);
    expect((await activities(pending.id)).length).toBe(before);
    const startsBefore = await prisma.activityLog.count({
      where: { orderId: workflowOrder.id, action: "SEWING_STARTED" },
    });
    await sewing.post(`/api/sewing/orders/${workflowOrder.id}/start`).expect(409);
    expect(await prisma.activityLog.count({
      where: { orderId: workflowOrder.id, action: "SEWING_STARTED" },
    })).toBe(startsBefore);
  });

  it("rolls back a business update when its activity insert fails in the same transaction", async () => {
    const order = await createBatch();
    const before = await prisma.activityLog.count({ where: { orderId: order.id } });
    await expect(prisma.$transaction(async (tx) => {
      await tx.cuttingOrder.update({
        where: { id: order.id }, data: { actualFabricYds: "99.00" },
      });
      await recordActivity(tx, {
        user: { id: users.supervisor.id, role: "invalid_test_role" },
        action: "ORDER_RESUBMITTED", orderId: order.id, metadata: {},
      });
    })).rejects.toThrow();
    const stored = await prisma.cuttingOrder.findUnique({ where: { id: order.id } });
    expect(Number(stored.actualFabricYds)).toBe(92);
    expect(await prisma.activityLog.count({ where: { orderId: order.id } })).toBe(before);
  });

  afterAll(async () => {
    try {
      // This temporary user's order has no verification audit records.
      if (otherUser) {
        await prisma.activityLog.deleteMany({ where: { actorId: otherUser.id } });
        await prisma.cuttingOrder.deleteMany({ where: { createdBy: otherUser.id } });
        await prisma.user.delete({ where: { id: otherUser.id } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});
