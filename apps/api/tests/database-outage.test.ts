import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { errorHandler, isDatabaseUnavailable } from "../src/middleware/error-handler";
import { requestContext } from "../src/middleware/request-context";
import { clearLoginAttempts } from "../src/modules/auth/login-rate-limit";
import { resetDatabase } from "./helpers";

// A database that is down, exhausted or slow must surface as a recognisable, retryable 503 (never as a
// wrong password) and the API must recover by itself once the database is back.

function unreachable(): Error {
  // The shape Prisma gives when the database server cannot be reached.
  return Object.assign(new Error("Can't reach database server at `db.example.supabase.co:5432`"), {
    name: "PrismaClientInitializationError",
    errorCode: "P1001",
  });
}

describe("database outages", () => {
  beforeEach(resetDatabase);
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  it("recognises unreachable, exhausted and timed-out databases, but not ordinary bugs", () => {
    expect(isDatabaseUnavailable(unreachable())).toBe(true);
    expect(isDatabaseUnavailable(Object.assign(new Error("Timed out fetching a new connection from the connection pool"), { code: "P2024" }))).toBe(true);
    expect(isDatabaseUnavailable(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isDatabaseUnavailable(new Error("sorry, too many clients already"))).toBe(true);
    expect(isDatabaseUnavailable(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isDatabaseUnavailable(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))).toBe(false);
  });

  it("answers 503 DATABASE_UNAVAILABLE with a reference, and never logs the connection string", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = express();
    app.use(requestContext);
    app.get("/api/v1/products", (_request, _response, next) => {
      next(Object.assign(new Error("connect ECONNREFUSED postgresql://postgres:hunter2@db.example.co:5432/postgres"), { code: "ECONNREFUSED" }));
    });
    app.use(errorHandler);

    const response = await request(app).get("/api/v1/products").set("X-Request-Id", "outage_1");

    expect(response.status).toBe(503);
    expect(response.headers["retry-after"]).toBe("5");
    expect(response.body.error).toEqual({ code: "DATABASE_UNAVAILABLE", message: expect.stringContaining("try again"), requestId: "outage_1" });
    const logged = errorLog.mock.calls.map((call) => String(call[0])).join("\n");
    expect(logged).not.toContain("hunter2");
    expect(logged).toContain("DATABASE_UNAVAILABLE");
  });

  it("tells the admin login that the database is down instead of 'Invalid credentials'", async () => {
    await clearLoginAttempts();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spy = vi.spyOn(prisma.adminUser, "findMany").mockRejectedValueOnce(unreachable());

    const response = await request(createApp()).post("/api/v1/auth/login").send({ password: "taimuomar" });
    spy.mockRestore();

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("DATABASE_UNAVAILABLE");
  });

  it("recovers on the next request once the database is back, without a restart", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Prisma's model objects lose a spied method once the spy is restored, so the spy passes through to a
    // bound copy of the real query after the single simulated outage.
    const realFindMany = prisma.product.findMany.bind(prisma.product);
    vi.spyOn(prisma.product, "findMany")
      .mockImplementation(((...args: Parameters<typeof realFindMany>) => realFindMany(...args)) as never)
      .mockRejectedValueOnce(unreachable());
    const app = createApp();

    expect((await request(app).get("/api/v1/catalogue")).status).toBe(503);
    expect((await request(app).get("/api/v1/catalogue")).status).toBe(200);
  });
});

