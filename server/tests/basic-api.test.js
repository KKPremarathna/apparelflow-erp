import "dotenv/config";
import request from "supertest";
import { describe, it, expect, afterAll } from "vitest";
import app from "../src/app.js";
import prisma from "../src/db/prisma.js";

describe("Basic API checks", () => {
  it("returns a healthy API response", async () => {
    const response = await request(app)
      .get("/api/health");

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      success: true,
      message: "ApparelFlow API is running",
    });
  });

  it("blocks the sewing queue without authentication", async () => {
    const response = await request(app)
      .get("/api/sewing/queue");

    expect(response.status).toBe(401);

    expect(response.body.message).toBe(
      "Please log in first."
    );
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});