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

  it("bulk deletes terminal orders atomically and rejects mixed non-terminal selections", async () => {
    const product = await seededProduct("house-plant");
    const first = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    const second = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    const pending = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    const agent = await loggedInAgent();

    await agent.patch(`/api/v1/admin/orders/${first.body.id}/status`).send({ status: "declined" });
    await agent.patch(`/api/v1/admin/orders/${second.body.id}/status`).send({ status: "completed" });

    const rejected = await agent.post("/api/v1/admin/orders/bulk-delete").send({
      ids: [first.body.id, pending.body.id],
    });
    expect(rejected.status).toBe(409);
    expect(await prisma.order.findMany({ where: { id: { in: [first.body.id, pending.body.id] } } })).toHaveLength(2);

    const deleted = await agent.post("/api/v1/admin/orders/bulk-delete").send({
      ids: [first.body.id, second.body.id],
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ deleted: 2 });
    expect(await prisma.order.findMany({ where: { id: { in: [first.body.id, second.body.id] } } })).toHaveLength(0);
    expect(await prisma.order.findUnique({ where: { id: pending.body.id } })).not.toBeNull();
  });



  it("accepts an edited pending order and reconciles reserved stock transactionally", async () => {
    const housePlant = await seededProduct("house-plant");
    const snakePlant = await prisma.product.findUniqueOrThrow({ where: { slug: "snake-plant" } });
    const aloeVera = await prisma.product.findUniqueOrThrow({ where: { slug: "aloe-vera" } });
    const fiddleLeaf = await prisma.product.findUniqueOrThrow({ where: { slug: "fiddle-leaf-fig" } });
    const agent = await loggedInAgent();

    const created = await request(createApp()).post("/api/v1/orders").send(validOrder({
      items: [
        { productId: housePlant.id, quantity: 2 },
        { productId: snakePlant.id, quantity: 1 },
        { productId: aloeVera.id, quantity: 1 },
      ],
    }));
    const pending = (await agent.get("/api/v1/admin/orders")).body.items
      .find((order: { id: string }) => order.id === created.body.id);

    const byProductId = new Map(
      pending.items.map((item: { id: string; productId: string }) => [item.productId, item]),
    );
    const houseLine = byProductId.get(housePlant.id) as { id: string };
    const snakeLine = byProductId.get(snakePlant.id) as { id: string };
    const aloeLine = byProductId.get(aloeVera.id) as { id: string };

    const accepted = await agent
      .post(`/api/v1/admin/orders/${created.body.id}/accept-edited`)
      .send({
        items: [
          {
            orderItemId: houseLine.id,
            included: true,
            productId: housePlant.id,
            quantity: 1,
          },
          {
            orderItemId: snakeLine.id,
            included: false,
            productId: snakePlant.id,
            quantity: 1,
          },
          {
            orderItemId: aloeLine.id,
            included: true,
            productId: fiddleLeaf.id,
            quantity: 2,
          },
        ],
      });

    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe("CONFIRMED");
    expect(accepted.body.subtotalQar).toBe(180 + (260 * 2));
    expect(accepted.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: housePlant.id, quantity: 1, unitPriceQar: 180 }),
      expect.objectContaining({ productId: fiddleLeaf.id, quantity: 2, unitPriceQar: 260 }),
    ]));
    expect(accepted.body.items).toHaveLength(2);

    expect(await inventoryFor(housePlant.id)).toMatchObject({ quantity: 11 });
    expect(await inventoryFor(snakePlant.id)).toMatchObject({ quantity: 16 });
    expect(await inventoryFor(aloeVera.id)).toMatchObject({ quantity: 20 });
    expect(await inventoryFor(fiddleLeaf.id)).toMatchObject({ quantity: 6 });
  });

  it("rolls back an edited acceptance when replacement stock changed", async () => {
    const housePlant = await seededProduct("house-plant");
    const fiddleLeaf = await prisma.product.findUniqueOrThrow({ where: { slug: "fiddle-leaf-fig" } });
    const agent = await loggedInAgent();
    const created = await request(createApp()).post("/api/v1/orders").send(validOrder({
      items: [{ productId: housePlant.id, quantity: 1 }],
    }));
    const pending = (await agent.get("/api/v1/admin/orders")).body.items
      .find((order: { id: string }) => order.id === created.body.id);
    const line = pending.items[0];

    const rejected = await agent
      .post(`/api/v1/admin/orders/${created.body.id}/accept-edited`)
      .send({
        items: [{
          orderItemId: line.id,
          included: true,
          productId: fiddleLeaf.id,
          quantity: 9,
        }],
      });

    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await inventoryFor(housePlant.id)).toMatchObject({ quantity: 11 });
    expect(await inventoryFor(fiddleLeaf.id)).toMatchObject({ quantity: 8 });
    expect(await prisma.order.findUnique({ where: { id: created.body.id }, include: { items: true } }))
      .toMatchObject({
        status: "PENDING",
        subtotalQar: housePlant.priceQar,
        items: [expect.objectContaining({ productId: housePlant.id, quantity: 1 })],
      });
  });

  it("returns reserved inventory exactly once when an order is declined", async () => {
    const product = await seededProduct("house-plant");
    const agent = await loggedInAgent();
    const created = await request(createApp()).post("/api/v1/orders").send(validOrder({
      items: [{ productId: product.id, quantity: 2 }],
    }));
    expect(await inventoryFor(product.id)).toMatchObject({ quantity: 10 });

    const declined = await agent
      .patch(`/api/v1/admin/orders/${created.body.id}/status`)
      .send({ status: "declined" });
    expect(declined.status).toBe(200);
    expect(await inventoryFor(product.id)).toMatchObject({ quantity: 12 });

    const repeated = await agent
      .patch(`/api/v1/admin/orders/${created.body.id}/status`)
      .send({ status: "declined" });
    expect(repeated.status).toBe(200);
    expect(await inventoryFor(product.id)).toMatchObject({ quantity: 12 });
  });

});
