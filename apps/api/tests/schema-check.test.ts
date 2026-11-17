import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { isMissingSchema, requiredSchemaState } from "../src/lib/schema-check";

// A database behind the code (a migration not applied) must show up in /ready, not be discovered by customers.
describe("required schema in the readiness check", () => {
  afterAll(() => prisma.$disconnect());

  it("is current on a fully migrated database", async () => {
    expect(await requiredSchemaState()).toBe("current");
    const ready = await request(createApp()).get("/api/v1/ready").expect(200);
    expect(ready.body).toMatchObject({ status: "ready", database: "connected", schema: "current" });
  });

  it("answers 503 SCHEMA_OUTDATED when a required column is missing, without details", async () => {
    // Replaced by hand and put back: undoing a spy on Prisma's client deletes the method instead of restoring it.
    const outbox = (prisma as unknown as { notificationOutbox: { findFirst: (...args: unknown[]) => Promise<unknown> } }).notificationOutbox;
    const real = outbox.findFirst;
    outbox.findFirst = () => Promise.reject(Object.assign(new Error("The column `NotificationOutbox.leaseExpiresAt` does not exist in the current database."), { code: "P2022" }));
    try {
      const ready = await request(createApp()).get("/api/v1/ready");
      expect(ready.status).toBe(503);
      expect(ready.body).toMatchObject({ status: "unavailable", schema: "outdated", error: { code: "SCHEMA_OUTDATED" } });
      expect(JSON.stringify(ready.body)).not.toContain("leaseExpiresAt");
    } finally {
      outbox.findFirst = real;
    }
  });

  it("tells a missing table or column apart from other database errors", () => {
    expect(isMissingSchema({ code: "P2021" })).toBe(true);
    expect(isMissingSchema({ code: "P2022" })).toBe(true);
    expect(isMissingSchema(new Error("SQLITE_ERROR: no such column: requestFingerprint"))).toBe(true);
    expect(isMissingSchema({ code: "P1001", message: "Can't reach database server" })).toBe(false);
    expect(isMissingSchema(new TypeError("x is not a function"))).toBe(false);
  });
});
