import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { createApp } from "../src/app";

describe("GET /api/v1/health", () => {
  beforeAll(() => seedDatabase());

  it("reports that the API is ready", async () => {
    const response = await request(createApp()).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("checks that the application schema is reachable", async () => {
    const response = await request(createApp()).get("/api/v1/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ready",
      database: "connected",
    });
  });
});
