import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { deliveryChargeToConfirm, FREE_DELIVERY_THRESHOLD_QAR } from "../src/lib/delivery";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

describe("delivery charge below the free-delivery threshold", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("is to be confirmed strictly below 150 QAR", () => {
    expect(FREE_DELIVERY_THRESHOLD_QAR).toBe(150);
    for (const subtotal of [0, 100, 149, 149.99]) expect(deliveryChargeToConfirm(subtotal)).toBe(true);
    for (const subtotal of [150, 150.01, 151, 500]) expect(deliveryChargeToConfirm(subtotal)).toBe(false);
  });

  async function orderAt(priceQar: number, quantity = 1) {
    const product = await seededProduct("house-plant");
    await prisma.product.update({ where: { id: product.id }, data: { priceQar } });
    return request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity }] }));
  }

  it("flags the order from the server's own prices, without inventing a fee", async () => {
    const below = await orderAt(149);
    expect(below.status).toBe(201);
    expect(below.body).toMatchObject({ subtotalQar: 149, deliveryFeeQar: 0, deliveryChargePending: true });

    const at = await orderAt(150);
    expect(at.body).toMatchObject({ subtotalQar: 150, deliveryFeeQar: 0, deliveryChargePending: false });

    const above = await orderAt(151);
    expect(above.body).toMatchObject({ subtotalQar: 151, deliveryChargePending: false });
  });

  it("ignores a delivery fee or flag sent by the browser", async () => {
    const product = await seededProduct("house-plant");
    await prisma.product.update({ where: { id: product.id }, data: { priceQar: 100 } });
    const response = await request(createApp()).post("/api/v1/orders").send({ ...validOrder({ items: [{ productId: product.id, quantity: 1 }] }), deliveryFeeQar: 0 });
    expect(response.body).toMatchObject({ deliveryFeeQar: 0, deliveryChargePending: true });
    const forged = await request(createApp()).post("/api/v1/orders").send({ ...validOrder({ items: [{ productId: product.id, quantity: 1 }] }), deliveryChargePending: false });
    expect(forged.status).toBe(400);
  });

  it("lets an admin confirm the charge, which then counts in the order total", async () => {
    const placed = await orderAt(120);
    const agent = await loggedInAgent();
    const listed = await agent.get("/api/v1/admin/orders").expect(200);
    expect(listed.body.items.find((order: { id: string }) => order.id === placed.body.id)).toMatchObject({ deliveryChargePending: true });

    expect((await request(createApp()).patch(`/api/v1/admin/orders/${placed.body.id}/delivery-fee`).send({ deliveryFeeQar: 15 })).status).toBe(401);
    expect((await agent.patch(`/api/v1/admin/orders/${placed.body.id}/delivery-fee`).send({ deliveryFeeQar: 12.5 })).status).toBe(400);
    expect((await agent.patch(`/api/v1/admin/orders/${placed.body.id}/delivery-fee`).send({ deliveryFeeQar: -1 })).status).toBe(400);

    const confirmed = await agent.patch(`/api/v1/admin/orders/${placed.body.id}/delivery-fee`).send({ deliveryFeeQar: 15 }).expect(200);
    expect(confirmed.body).toMatchObject({ deliveryFeeQar: 15, deliveryChargePending: false, deliveryFeeConfirmedAt: expect.any(String) });
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } });
    expect(stored.subtotalQar + stored.deliveryFeeQar).toBe(135);
  });

  it("re-checks the rule when an unconfirmed order is edited, and keeps a confirmed charge", async () => {
    const placed = await orderAt(80, 2);
    expect(placed.body).toMatchObject({ subtotalQar: 160, deliveryChargePending: false });
    const agent = await loggedInAgent();
    const line = placed.body.items[0];
    const edited = await agent.post(`/api/v1/admin/orders/${placed.body.id}/accept-edited`)
      .send({ items: [{ orderItemId: line.id, included: true, productId: line.productId, quantity: 1 }] }).expect(200);
    expect(edited.body).toMatchObject({ subtotalQar: 80, deliveryChargePending: true });

    const second = await orderAt(60);
    await agent.patch(`/api/v1/admin/orders/${second.body.id}/delivery-fee`).send({ deliveryFeeQar: 0 }).expect(200);
    const secondLine = second.body.items[0];
    const kept = await agent.post(`/api/v1/admin/orders/${second.body.id}/accept-edited`)
      .send({ items: [{ orderItemId: secondLine.id, included: true, productId: secondLine.productId, quantity: 1 }] }).expect(200);
    expect(kept.body).toMatchObject({ deliveryFeeQar: 0, deliveryChargePending: false });
  });
});
