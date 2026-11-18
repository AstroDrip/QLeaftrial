import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { clearOrderRateLimit } from "../../src/modules/orders/order-rate-limit";
import { resetDatabase, seededProduct, validOrder } from "../helpers";

// Migration 9c (owner's decision, 2026-11-18): every product at the demo price of 99 QAR goes to 0 QAR, published or
// not, nothing unpublished, other prices untouched. A published plant at 0 QAR is shown but cannot be ordered.
const migration = readFileSync(fileURLToPath(new URL("../../prisma/postgresql/migrations/9c_unset_demo_prices/migration.sql", import.meta.url)), "utf8");
const db = prisma as any;

describe("demo prices set to 0 (migration 9c)", () => {
  afterAll(() => prisma.$disconnect());

  it("sets every 99 QAR product to 0, keeps them published, leaves other prices alone, and 0 QAR plants cannot be ordered", async () => {
    await db.notificationOutbox.deleteMany();
    await resetDatabase();
    await clearOrderRateLimit();
    const live = await seededProduct("snake-plant");
    const draft = await seededProduct("peace-lily");
    const priced = await seededProduct("aloe-vera");
    await db.product.update({ where: { id: live.id }, data: { priceQar: 99, compareAtPriceQar: 150, published: true } });
    await db.product.update({ where: { id: draft.id }, data: { priceQar: 99, published: false } });
    await db.product.update({ where: { id: priced.id }, data: { priceQar: 100, published: true } });
    const before = await db.product.count({ where: { priceQar: 99 } });

    await db.$executeRawUnsafe(migration.split("\n").filter((line: string) => !line.startsWith("--")).join("\n"));

    expect(before).toBe(2);
    expect(await db.product.count({ where: { priceQar: 99 } })).toBe(0);
    expect(await db.product.findUniqueOrThrow({ where: { id: live.id } })).toMatchObject({ priceQar: 0, compareAtPriceQar: null, published: true });
    expect(await db.product.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ priceQar: 0, published: false });
    expect(await db.product.findUniqueOrThrow({ where: { id: priced.id } })).toMatchObject({ priceQar: 100, published: true });

    const shown = await request(createApp()).get(`/api/v1/products/${live.slug}`);
    expect(shown.status).toBe(200);
    expect(shown.body).toMatchObject({ priceQar: 0, compareAtPriceQar: null });
    const order = await request(createApp()).post("/api/v1/orders").set("Idempotency-Key", `pg-${crypto.randomUUID()}`)
      .send(validOrder({ items: [{ productId: live.id, quantity: 1 }] }));
    expect(order.status).toBe(400);
    expect(await db.order.count()).toBe(0);
  });
});
