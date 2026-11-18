import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { clearOrderRateLimit } from "../../src/modules/orders/order-rate-limit";
import { inventoryFor, loggedInAgent, resetDatabase, seededProduct, validOrder } from "../helpers";
import { PG_TEST_URL } from "./global-setup";
import { vi } from "vitest";
import { processOutbox } from "../../src/modules/notifications/outbox";
import { settleBackgroundWork } from "../../src/lib/after-response";

// The order rules on a real PostgreSQL, where requests really run at the same time on separate connections.
const db = prisma as any;

describe("orders on PostgreSQL", () => {
  beforeEach(async () => {
    await db.notificationOutbox.deleteMany();
    await resetDatabase();
    await clearOrderRateLimit();
  });
  afterAll(() => prisma.$disconnect());

  const app = createApp();
  const place = (body: unknown, key: string) => request(app).post("/api/v1/orders").set("Idempotency-Key", key).send(body as object);

  it("is really PostgreSQL, with several connections", async () => {
    const [{ version }] = await db.$queryRawUnsafe("select version()");
    expect(version).toMatch(/^PostgreSQL 17\./);
    const [{ count }] = await db.$queryRawUnsafe("select count(*)::int as count from \"_prisma_migrations\" where finished_at is not null");
    expect(count).toBe(13);
  });

  it("creates exactly one order when the same key arrives many times at once", async () => {
    const product = await seededProduct("house-plant");
    const stock = (await inventoryFor(product.id)).quantity;
    const body = validOrder({ items: [{ productId: product.id, quantity: 2 }] });
    const responses = await Promise.all(Array.from({ length: 12 }, () => place(body, "pg-same-key-00000001")));
    // Requests that all arrive before the first has saved each count towards the limit on new orders, so a burst
    // larger than that limit gets some "try again later" (429) answers. Those are retried with the same key.
    for (const response of responses) expect([200, 201, 429]).toContain(response.status);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(new Set(responses.filter((response) => response.status < 300).map((response) => response.body.orderNumber)).size).toBe(1);
    const retried = await place(body, "pg-same-key-00000001");
    expect(retried.status).toBe(200);
    expect(retried.body.orderNumber).toBe(responses.find((response) => response.status === 201)!.body.orderNumber);
    expect(await db.order.count()).toBe(1);
    expect(await db.orderItem.count()).toBe(1);
    expect((await inventoryFor(product.id)).quantity).toBe(stock - 2);
    // And exactly one email job and one sheet job for it.
    expect(await db.notificationOutbox.count({ where: { eventType: "ORDER_CREATED" } })).toBe(1);
    expect(await db.notificationOutbox.count({ where: { eventType: "SHEET_SYNC" } })).toBe(1);
  });

  it("never sells more than the stock when many customers order the last plants together", async () => {
    const product = await seededProduct("house-plant");
    await db.inventory.update({ where: { productId: product.id }, data: { quantity: 5 } });
    const body = validOrder({ items: [{ productId: product.id, quantity: 1 }] });
    // Separate clients (separate IP addresses as far as the rate limit is concerned is not needed: 10 per window).
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => place(body, `pg-last-stock-${String(index).padStart(6, "0")}`)));
    const created = responses.filter((response) => response.status === 201).length;
    for (const response of responses) expect([201, 409]).toContain(response.status);
    expect(created).toBe(5);
    expect(responses.filter((response) => response.status === 409).every((response) => response.body.error.code === "INSUFFICIENT_STOCK")).toBe(true);
    expect((await inventoryFor(product.id)).quantity).toBe(0);
    expect(await db.order.count()).toBe(5);
  });

  it("does not deadlock when two baskets hold the same plants in opposite order", async () => {
    const a = await seededProduct("house-plant");
    const b = await db.product.findUniqueOrThrow({ where: { slug: "snake-plant" } });
    for (const id of [a.id, b.id]) await db.inventory.update({ where: { productId: id }, data: { quantity: 100 } });
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => place(
      validOrder({ items: index % 2 ? [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }] : [{ productId: b.id, quantity: 1 }, { productId: a.id, quantity: 1 }] }),
      `pg-opposite-order-${String(index).padStart(4, "0")}`,
    )));
    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(201));
    expect((await inventoryFor(a.id)).quantity).toBe(90);
    expect((await inventoryFor(b.id)).quantity).toBe(90);
  });

  it("refuses the same key with a different order, even when both arrive together", async () => {
    const product = await seededProduct("house-plant");
    const stock = (await inventoryFor(product.id)).quantity;
    const one = validOrder({ items: [{ productId: product.id, quantity: 1 }] });
    const two = validOrder({ items: [{ productId: product.id, quantity: 3 }] });
    const responses = await Promise.all([place(one, "pg-key-reuse-0000001"), place(two, "pg-key-reuse-0000001"), place(one, "pg-key-reuse-0000001"), place(two, "pg-key-reuse-0000001")]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.every((status) => [200, 201, 409].includes(status))).toBe(true);
    const order = await db.order.findFirstOrThrow({ include: { items: true } });
    expect(await db.order.count()).toBe(1);
    expect((await inventoryFor(product.id)).quantity).toBe(stock - order.items[0].quantity);
    for (const response of responses.filter((r) => r.status === 409)) expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("puts stock back once and never records a payment after a decline, under simultaneous admin actions", async () => {
    const product = await seededProduct("house-plant");
    await db.product.update({ where: { id: product.id }, data: { priceQar: 200 } });
    const stock = (await inventoryFor(product.id)).quantity;
    const admin = await loggedInAgent();
    for (let round = 0; round < 5; round += 1) {
      const placed = await place(validOrder({ items: [{ productId: product.id, quantity: 2 }] }), `pg-admin-race-${round}00000`);
      await Promise.all([
        admin.patch(`/api/v1/admin/orders/${placed.body.id}/status`).send({ status: "declined" }),
        admin.patch(`/api/v1/admin/orders/${placed.body.id}/status`).send({ status: "declined" }),
        admin.patch(`/api/v1/admin/orders/${placed.body.id}/payment`).send({ paymentStatus: "PAID" }),
      ]);
      const entries = await db.adminAuditLog.findMany({ where: { orderId: placed.body.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      expect(entries.filter((entry: { action: string }) => entry.action === "order.status")).toHaveLength(1);
      const declinedAt = entries.findIndex((entry: { action: string }) => entry.action === "order.status");
      const paidAt = entries.findIndex((entry: { action: string }) => entry.action === "order.payment");
      if (paidAt !== -1) expect(paidAt).toBeLessThan(declinedAt);
    }
    expect((await inventoryFor(product.id)).quantity).toBe(stock);
  });

  it("stops a release whose migrations are not all applied, and passes one that is up to date", () => {
    const script = fileURLToPath(new URL("../../scripts/check-migrations.mjs", import.meta.url));
    const run = (env: Record<string, string>) => {
      try {
        return { code: 0, out: execFileSync(process.execPath, [script], { env: { ...process.env, QLEAVES_DATABASE_PROVIDER: "postgresql", DATABASE_URL: PG_TEST_URL, DIRECT_URL: "", ...env }, encoding: "utf8", stdio: "pipe" }) };
      } catch (error) {
        const failure = error as { status: number; stdout: string; stderr: string };
        return { code: failure.status, out: `${failure.stdout}${failure.stderr}` };
      }
    };
    expect(run({})).toMatchObject({ code: 0, out: expect.stringContaining("all 13 migrations are applied") });
    // Pretend the newest migration was never applied.
    execFileSync(process.execPath, ["-e", `const pg=require("pg");const c=new pg.Client({connectionString:process.argv[1]});c.connect().then(()=>c.query("update \\"_prisma_migrations\\" set rolled_back_at=now() where migration_name='7_order_fingerprint_outbox_lease'")).then(()=>c.end())`, PG_TEST_URL], { cwd: fileURLToPath(new URL("../..", import.meta.url)) });
    try {
      const behind = run({});
      expect(behind.code).toBe(1);
      expect(behind.out).toContain("7_order_fingerprint_outbox_lease");
      expect(behind.out).not.toContain("postgres:postgres");
    } finally {
      execFileSync(process.execPath, ["-e", `const pg=require("pg");const c=new pg.Client({connectionString:process.argv[1]});c.connect().then(()=>c.query("update \\"_prisma_migrations\\" set rolled_back_at=null where migration_name='7_order_fingerprint_outbox_lease'")).then(()=>c.end())`, PG_TEST_URL], { cwd: fileURLToPath(new URL("../..", import.meta.url)) });
    }
  });

  it("sends each email once when several workers run at the same time on separate connections", async () => {
    const product = await seededProduct("house-plant");
    // Orders placed while email was not set up: their jobs are waiting.
    for (let index = 0; index < 6; index += 1) await place(validOrder({ items: [{ productId: product.id, quantity: 1 }] }), `pg-worker-order-${index}00000`);
    await settleBackgroundWork();
    await db.notificationOutbox.updateMany({ where: { eventType: "ORDER_CREATED" }, data: { status: "PENDING", nextAttemptAt: new Date(Date.now() - 1000) } });
    process.env.EMAIL_PROVIDER_API_KEY = "re_test_key_not_a_real_key";
    process.env.ORDER_NOTIFICATION_EMAIL = "delivered@resend.dev";
    const sentKeys: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      sentKeys.push((init?.headers as Record<string, string>)["Idempotency-Key"]);
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(JSON.stringify({ id: "email" }), { status: 200 });
    }));
    try {
      await Promise.all(Array.from({ length: 5 }, () => processOutbox({ limit: 20 })));
    } finally {
      vi.unstubAllGlobals();
      process.env.EMAIL_PROVIDER_API_KEY = "";
      process.env.ORDER_NOTIFICATION_EMAIL = "";
    }
    expect(sentKeys).toHaveLength(6);
    expect(new Set(sentKeys).size).toBe(6);
    expect(await db.notificationOutbox.count({ where: { eventType: "ORDER_CREATED", status: "SENT" } })).toBe(6);
  });
});
