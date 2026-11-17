import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { inventoryFor, loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

// Requests that arrive at the same moment (a double tap, two admins, two customers after the last plant) must leave
// stock, status and payment consistent. A request that loses the race gets a clear refusal, never a half-done change.
describe("orders under simultaneous requests", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  const REFUSED = [409, 503];
  const auditLog = (prisma as any).adminAuditLog;
  const inOrder = { orderBy: [{ createdAt: "asc" }, { id: "asc" }] };

  it("never sells more than the stock when customers order the last plants together", async () => {
    const product = await seededProduct("house-plant");
    await prisma.inventory.update({ where: { productId: product.id }, data: { quantity: 3 } });
    const app = createApp();
    const responses = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      request(app).post("/api/v1/orders").set("Idempotency-Key", `test-${crypto.randomUUID()}`).set("Idempotency-Key", `last-plants-attempt-${index}`)
        .send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }))));
    const created = responses.filter((response) => response.status === 201);
    for (const response of responses) expect([201, ...REFUSED]).toContain(response.status);
    expect(created.length).toBeGreaterThan(0);
    expect(created.length).toBeLessThanOrEqual(3);
    expect((await inventoryFor(product.id)).quantity).toBe(3 - created.length);
    expect(await prisma.order.count()).toBe(created.length);
    expect(await prisma.orderItem.count()).toBe(created.length);
  });

  it("creates one order when the same checkout attempt is sent several times at once", async () => {
    const product = await seededProduct("house-plant");
    const stock = (await inventoryFor(product.id)).quantity;
    const app = createApp();
    const responses = await Promise.all(Array.from({ length: 5 }, () =>
      request(app).post("/api/v1/orders").set("Idempotency-Key", `test-${crypto.randomUUID()}`).set("Idempotency-Key", "same-attempt-key-0001")
        .send(validOrder({ items: [{ productId: product.id, quantity: 2 }] }))));
    const numbers = new Set(responses.filter((response) => response.status < 300).map((response) => response.body.orderNumber));
    expect(numbers.size).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    expect((await inventoryFor(product.id)).quantity).toBe(stock - 2);
  });

  it("puts stock back once when an order is declined several times at the same moment", async () => {
    const product = await seededProduct("house-plant");
    const stock = (await inventoryFor(product.id)).quantity;
    const placed = await request(createApp()).post("/api/v1/orders").set("Idempotency-Key", `test-${crypto.randomUUID()}`).send(validOrder({ items: [{ productId: product.id, quantity: 4 }] }));
    expect((await inventoryFor(product.id)).quantity).toBe(stock - 4);
    const admin = await loggedInAgent();
    const responses = await Promise.all(Array.from({ length: 4 }, () =>
      admin.patch(`/api/v1/admin/orders/${placed.body.id}/status`).send({ status: "declined" })));
    for (const response of responses) expect([200, ...REFUSED]).toContain(response.status);
    expect((await inventoryFor(product.id)).quantity).toBe(stock);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } })).status).toBe("CANCELLED");
    expect(await auditLog.count({ where: { orderId: placed.body.id, action: "order.status" } })).toBe(1);
  });

  it("never records a payment on an order that was already declined, whichever request lands first", async () => {
    const product = await seededProduct("house-plant");
    await prisma.product.update({ where: { id: product.id }, data: { priceQar: 200 } });
    const admin = await loggedInAgent();
    for (let round = 0; round < 4; round += 1) {
      const placed = await request(createApp()).post("/api/v1/orders").set("Idempotency-Key", `test-${crypto.randomUUID()}`).send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
      await Promise.all([
        admin.patch(`/api/v1/admin/orders/${placed.body.id}/payment`).send({ paymentStatus: "PAID" }),
        admin.patch(`/api/v1/admin/orders/${placed.body.id}/status`).send({ status: "declined" }),
      ]);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } });
      const entries: Array<{ action: string }> = await auditLog.findMany({ where: { orderId: order.id }, ...inOrder });
      const declinedAt = entries.findIndex((entry) => entry.action === "order.status");
      const paidAt = entries.findIndex((entry) => entry.action === "order.payment");
      // Paid and then declined is a real sequence (a refund follows). Declined and then paid must never happen.
      if (order.status === "CANCELLED" && order.paymentStatus === "PAID") expect(paidAt).toBeLessThan(declinedAt);
      if (paidAt === -1) expect(order.paymentStatus).toBe("PENDING");
    }
  });

  it("keeps the delivery charge and its record in step when it is corrected and paid together", async () => {
    const product = await seededProduct("house-plant");
    await prisma.product.update({ where: { id: product.id }, data: { priceQar: 100 } });
    const admin = await loggedInAgent();
    const placed = await request(createApp()).post("/api/v1/orders").set("Idempotency-Key", `test-${crypto.randomUUID()}`).send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    await admin.patch(`/api/v1/admin/orders/${placed.body.id}/delivery-fee`).send({ deliveryFeeQar: 10 }).expect(200);
    await Promise.all([
      admin.patch(`/api/v1/admin/orders/${placed.body.id}/delivery-fee`).send({ deliveryFeeQar: 25 }),
      admin.patch(`/api/v1/admin/orders/${placed.body.id}/payment`).send({ paymentStatus: "PAID" }),
    ]);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } });
    const recorded: number[] = (await auditLog.findMany({ where: { orderId: order.id, action: "order.deliveryFee" }, ...inOrder }))
      .map((entry: { detail: string }) => JSON.parse(entry.detail).to);
    // Whatever the order of arrival, the stored charge is the last one that was recorded.
    expect(order.deliveryFeeQar).toBe(recorded[recorded.length - 1]);
    expect([10, 25]).toContain(order.deliveryFeeQar);
  });
});
