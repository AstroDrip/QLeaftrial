import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { clearOrderRateLimit } from "../../src/modules/orders/order-rate-limit";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "../helpers";

// The paged admin lists on a real PostgreSQL: case-insensitive search ("mode: insensitive"), grouped counts and sums.
const db = prisma as any;

describe("paged admin lists on PostgreSQL", () => {
  beforeEach(async () => {
    await db.notificationOutbox.deleteMany();
    await resetDatabase();
    await clearOrderRateLimit();
  });
  afterAll(() => prisma.$disconnect());

  it("searches without regard to case, counts tabs and adds up invoices", async () => {
    const product = await seededProduct("snake-plant");
    const app = createApp();
    const ids: string[] = [];
    for (const name of ["Mariam Saleh", "Omar Khalid"]) {
      const response = await request(app).post("/api/v1/orders").set("Idempotency-Key", `pg-${crypto.randomUUID()}`)
        .send(validOrder({ customerName: name, items: [{ productId: product.id, quantity: 1 }] }));
      expect(response.status).toBe(201);
      ids.push(response.body.id);
    }
    await db.order.update({ where: { id: ids[1] }, data: { status: "OUT_FOR_DELIVERY", paymentStatus: "PAID" } });
    const agent = await loggedInAgent();

    const orders = await agent.get("/api/v1/admin/orders?page=1&tab=PENDING&q=MARIAM");
    expect(orders.status).toBe(200);
    expect(orders.body.items.map((order: { id: string }) => order.id)).toEqual([ids[0]]);
    expect(orders.body.counts).toEqual({ PENDING: 1, CONFIRMED: 0, CANCELLED: 0, DELIVERED: 0 });
    const all = await agent.get("/api/v1/admin/orders?page=1&tab=CONFIRMED");
    expect(all.body.counts).toEqual({ PENDING: 1, CONFIRMED: 1, CANCELLED: 0, DELIVERED: 0 });

    const products = await agent.get(`/api/v1/admin/products?page=1&q=${encodeURIComponent(product.name.toUpperCase())}`);
    expect(products.body.items.map((item: { id: string }) => item.id)).toContain(product.id);

    const invoices = await agent.get("/api/v1/admin/invoices?page=1");
    const subtotal = (await db.order.findUniqueOrThrow({ where: { id: ids[0] } })).subtotalQar;
    expect(invoices.body.totals).toEqual({ count: 2, totalQar: subtotal * 2, paidQar: subtotal, unpaidQar: subtotal });
  });
});
