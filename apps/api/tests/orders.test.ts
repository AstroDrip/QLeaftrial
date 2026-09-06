import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { inventoryFor, loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

describe("orders and admin operations", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("creates an order at server-side prices and decrements inventory", async () => {
    const product = await seededProduct("house-plant");
    const response = await request(createApp()).post("/api/v1/orders").send(validOrder({
      items: [{ productId: product.id, quantity: 2, unitPriceQar: 1 }],
    }));
    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ orderNumber: expect.stringMatching(/^QL-/), subtotalQar: product.priceQar * 2 }));
    expect(await inventoryFor(product.id)).toMatchObject({ quantity: 10 });
  });

  it("rejects orders that exceed stock without creating a record", async () => {
    const product = await seededProduct("house-plant");
    const response = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 99 }] }));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await prisma.order.count()).toBe(0);
  });

  it("lists orders and updates status for an authenticated admin", async () => {
    const product = await seededProduct("house-plant");
    const created = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    const agent = await loggedInAgent();
    const listed = await agent.get("/api/v1/admin/orders");
    expect(listed.status).toBe(200);
    const updated = await agent.patch(`/api/v1/admin/orders/${created.body.id}/status`).send({ status: "CONFIRMED" });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe("CONFIRMED");
  });

  it("supports Semi status names and reports completed sales", async () => {
    const product = await seededProduct("house-plant");
    const created = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    const agent = await loggedInAgent();
    const accepted = await agent.patch(`/api/v1/admin/orders/${created.body.id}/status`).send({ status: "accepted" });
    expect(accepted.body.status).toBe("CONFIRMED");
    const completed = await agent.patch(`/api/v1/admin/orders/${created.body.id}/status`).send({ status: "completed" });
    expect(completed.body.status).toBe("DELIVERED");
    const report = await agent.get("/api/v1/admin/sales");
    expect(report.status).toBe(200);
    expect(report.body).toEqual(expect.objectContaining({ orders: 1, revenueQar: product.priceQar }));
  });

  it("deletes a visible set atomically only when every order is deletable", async () => {
    const product = await seededProduct("house-plant");
    const first = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    const second = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    const agent = await loggedInAgent();
    await agent.patch(`/api/v1/admin/orders/${first.body.id}/status`).send({ status: "completed" });

    const rejected = await agent
      .delete("/api/v1/admin/orders")
      .send({ ids: [first.body.id, second.body.id] });

    expect(rejected.status).toBe(409);
    expect(await prisma.order.count({ where: { id: { in: [first.body.id, second.body.id] } } })).toBe(2);

    await agent.patch(`/api/v1/admin/orders/${second.body.id}/status`).send({ status: "declined" });
    const deleted = await agent
      .delete("/api/v1/admin/orders")
      .send({ ids: [first.body.id, second.body.id] });

    expect(deleted.status).toBe(204);
    expect(await prisma.order.count({ where: { id: { in: [first.body.id, second.body.id] } } })).toBe(0);
  });
});
