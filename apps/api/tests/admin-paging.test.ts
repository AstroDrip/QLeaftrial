import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

// Admin lists in pages: products, orders and invoices are filtered, counted and added up in the database.
describe("paged admin lists", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  async function placeOrders(count: number) {
    const product = await seededProduct("snake-plant");
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const response = await request(createApp()).post("/api/v1/orders").set("Idempotency-Key", `test-${crypto.randomUUID()}`)
        .send(validOrder({ customerName: `Customer ${index}`, phone: `+974 5555 10${String(index).padStart(2, "0")}`, items: [{ productId: product.id, quantity: 1 }] }));
      expect(response.status).toBe(201);
      ids.push(response.body.id);
    }
    return { product, ids };
  }

  it("pages products with a view, a search, a sort and the count of every view", async () => {
    const agent = await loggedInAgent();
    const all = (await agent.get("/api/v1/admin/products")).body.items as Array<{ id: string; name: string }>;
    expect(all.length).toBeGreaterThan(2);
    await prisma.product.update({ where: { id: all[0].id }, data: { published: false, priceQar: 0 } });

    const first = await agent.get("/api/v1/admin/products?page=1&pageSize=25&sort=name");
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ page: 1, pageSize: 25, totalItems: all.length });
    expect(first.body.counts).toMatchObject({ all: all.length, drafts: 1, unpriced: 1 });
    expect(first.body.items.map((item: { name: string }) => item.name)).toEqual([...first.body.items.map((item: { name: string }) => item.name)].sort((a: string, b: string) => a.localeCompare(b)));

    const drafts = await agent.get("/api/v1/admin/products?page=1&view=drafts");
    expect(drafts.body.items.map((item: { id: string }) => item.id)).toEqual([all[0].id]);
    const search = await agent.get(`/api/v1/admin/products?page=1&q=${encodeURIComponent(all[1].name.slice(0, 4).toUpperCase())}`);
    expect(search.body.items.map((item: { id: string }) => item.id)).toContain(all[1].id);
    expect((await agent.get("/api/v1/admin/products?page=1&pageSize=7")).status).toBe(400);
  });

  it("pages orders by status tab with search, sort and counts, and clears a whole finished tab", async () => {
    const { ids } = await placeOrders(4);
    const agent = await loggedInAgent();
    await prisma.order.update({ where: { id: ids[0] }, data: { status: "DELIVERED" } });
    await prisma.order.update({ where: { id: ids[1] }, data: { status: "PREPARING", subtotalQar: 9_999 } });
    await prisma.order.update({ where: { id: ids[2] }, data: { createdAt: new Date("2026-01-01T10:00:00Z") } });

    const pending = await agent.get("/api/v1/admin/orders?page=1&pageSize=25&tab=PENDING");
    expect(pending.body.counts).toEqual({ PENDING: 2, CONFIRMED: 1, CANCELLED: 0, DELIVERED: 1 });
    expect(pending.body.items.map((order: { id: string }) => order.id)).toEqual([ids[3], ids[2]]);
    const oldest = await agent.get("/api/v1/admin/orders?page=1&tab=PENDING&sort=oldest");
    expect(oldest.body.items[0].id).toBe(ids[2]);
    const accepted = await agent.get("/api/v1/admin/orders?page=1&tab=CONFIRMED");
    expect(accepted.body.items.map((order: { id: string }) => order.id)).toEqual([ids[1]]);
    const found = await agent.get("/api/v1/admin/orders?page=1&tab=PENDING&q=customer%203");
    expect(found.body.items.map((order: { id: string }) => order.id)).toEqual([ids[3]]);

    const one = await agent.get(`/api/v1/admin/orders/${ids[3]}`);
    expect(one.body).toMatchObject({ id: ids[3], customerName: "Customer 3" });

    expect((await agent.post("/api/v1/admin/orders/clear-tab").send({ tab: "PENDING" })).status).toBe(400);
    const cleared = await agent.post("/api/v1/admin/orders/clear-tab").send({ tab: "DELIVERED" });
    expect(cleared.body).toEqual({ deleted: 1 });
    expect(await prisma.order.count()).toBe(3);
  });

  it("pages invoices with totals for the whole filter and whole-day totals, admin only", async () => {
    const { ids } = await placeOrders(3);
    await prisma.order.update({ where: { id: ids[0] }, data: { status: "CANCELLED" } });
    await prisma.order.update({ where: { id: ids[1] }, data: { paymentStatus: "PAID" } });
    expect((await request(createApp()).get("/api/v1/admin/invoices")).status).toBe(401);

    const agent = await loggedInAgent();
    const invoices = await agent.get("/api/v1/admin/invoices?page=1&pageSize=25");
    const subtotal = (await prisma.order.findUniqueOrThrow({ where: { id: ids[1] } })).subtotalQar;
    expect(invoices.body.totals).toEqual({ count: 2, totalQar: subtotal * 2, paidQar: subtotal, unpaidQar: subtotal });
    expect(invoices.body.items.map((order: { id: string }) => order.id)).toEqual([ids[2], ids[1]]);
    expect(Object.values(invoices.body.dayTotals)).toEqual([subtotal * 2]);
    const unpaid = await agent.get("/api/v1/admin/invoices?page=1&payment=unpaid");
    expect(unpaid.body.items.map((order: { id: string }) => order.id)).toEqual([ids[2]]);
    const future = await agent.get("/api/v1/admin/invoices?page=1&from=2099-01-01");
    expect(future.body.totals.count).toBe(0);
  });

  it("still answers with everything when no page is asked for (pickers)", async () => {
    await placeOrders(2);
    const agent = await loggedInAgent();
    const orders = await agent.get("/api/v1/admin/orders");
    expect(orders.body).toEqual({ items: expect.any(Array) });
    expect(orders.body.items).toHaveLength(2);
  });
});
