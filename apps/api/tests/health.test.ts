import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { createApp } from "../src/app";

describe("GET /api/v1/health", () => {
  beforeAll(() => seedDatabase());

  it("reports that the API is ready", async () => {
    const response = await request(createApp())
      .get("/api/v1/health")
      .set("X-Request-Id", "health_check-123");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toBe("health_check-123");
  });

  it("checks that the application schema is reachable", async () => {
    const response = await request(createApp()).get("/api/v1/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ready",
      database: "connected",
    });
  });

  it("replaces untrusted request IDs with a generated UUID", async () => {
    const response = await request(createApp())
      .get("/api/v1/health")
      .set("X-Request-Id", "invalid request id with spaces");

    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
