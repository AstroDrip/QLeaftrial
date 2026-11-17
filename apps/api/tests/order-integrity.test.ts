import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

// Money and order-state rules: what an admin may change, when, and that every such change is attributed.
describe("order money and state integrity", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  async function placed(priceQar = 120, quantity = 1) {
    const product = await seededProduct("house-plant");
    await prisma.product.update({ where: { id: product.id }, data: { priceQar } });
    const response = await request(createApp()).post("/api/v1/orders").set("Idempotency-Key", `test-${crypto.randomUUID()}`).send(validOrder({ items: [{ productId: product.id, quantity }] }));
    expect(response.status).toBe(201);
    return response.body as { id: string; orderNumber: string };
  }
  const audit = (orderId: string) => (prisma as any).adminAuditLog.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

  it("returns only what the customer needs when an order is placed", async () => {
    const product = await seededProduct("house-plant");
    const response = await request(createApp()).post("/api/v1/orders").set("Idempotency-Key", `test-${crypto.randomUUID()}`).set("Idempotency-Key", "customer-view-key-0001")
      .send(validOrder({ items: [{ productId: product.id, quantity: 2 }] }));
    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual(["area", "createdAt", "deliveryChargePending", "deliveryFeeQar", "id", "items", "orderNumber", "paymentMethod", "paymentStatus", "status", "subtotalQar"]);
    expect(Object.keys(response.body.items[0]).sort()).toEqual(["productId", "productName", "quantity", "unitPriceQar"]);
    const text = JSON.stringify(response.body);
    for (const internal of ["idempotencyKey", "customer-view-key-0001", "sheetSync", "editSummary", "updatedAt", "sku", "aisha@example.com", "5555 1234"]) expect(text).not.toContain(internal);
    // A replay of the same attempt gets the same safe view.
    const replay = await request(createApp()).post("/api/v1/orders").set("Idempotency-Key", `test-${crypto.randomUUID()}`).set("Idempotency-Key", "customer-view-key-0001")
      .send(validOrder({ items: [{ productId: product.id, quantity: 2 }] }));
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(response.body);
  });

  it("never lets a declined order become paid", async () => {
    const order = await placed();
    const admin = await loggedInAgent();
    await admin.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: "declined" }).expect(200);
    const response = await admin.patch(`/api/v1/admin/orders/${order.id}/payment`).send({ paymentStatus: "PAID" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ORDER_CLOSED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PENDING");
  });

  it("answers 404 for an unknown order and 503, not 404, when the database is down", async () => {
    const admin = await loggedInAgent();
    expect((await admin.patch("/api/v1/admin/orders/does-not-exist/payment").send({ paymentStatus: "PAID" })).status).toBe(404);
    const order = await placed(200);
    const outage = Object.assign(new Error("Can't reach database server"), { code: "P1001" });
    // Replace the method only for this one call and put the real one back by hand (Prisma's client is a proxy).
    const client = prisma as unknown as { $transaction: unknown };
    const real = client.$transaction;
    client.$transaction = vi.fn().mockRejectedValue(outage);
    try {
      const response = await admin.patch(`/api/v1/admin/orders/${order.id}/payment`).send({ paymentStatus: "PAID" });
      expect(response.status).toBe(503);
      expect(response.body.error.code).not.toBe("ORDER_NOT_FOUND");
    } finally {
      client.$transaction = real;
    }
  });

  it("will not mark an order paid while its delivery charge is still to be confirmed", async () => {
    const order = await placed(120);
    const admin = await loggedInAgent();
    const early = await admin.patch(`/api/v1/admin/orders/${order.id}/payment`).send({ paymentStatus: "PAID" });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("DELIVERY_CHARGE_PENDING");
    await admin.patch(`/api/v1/admin/orders/${order.id}/delivery-fee`).send({ deliveryFeeQar: 15 }).expect(200);
    await admin.patch(`/api/v1/admin/orders/${order.id}/payment`).send({ paymentStatus: "PAID" }).expect(200);
  });

  it("records a corrected delivery charge and refuses to change it once the order is paid", async () => {
    const order = await placed(120);
    const admin = await loggedInAgent();
    await admin.patch(`/api/v1/admin/orders/${order.id}/delivery-fee`).send({ deliveryFeeQar: 15 }).expect(200);
    await admin.patch(`/api/v1/admin/orders/${order.id}/delivery-fee`).send({ deliveryFeeQar: 20 }).expect(200);
    const changes = (await audit(order.id)).filter((entry: { action: string }) => entry.action === "order.deliveryFee");
    expect(changes).toHaveLength(2);
    expect(JSON.parse(changes[0].detail)).toEqual({ from: null, to: 15 });
    expect(JSON.parse(changes[1].detail)).toEqual({ from: 15, to: 20 });
    expect(changes[1].adminName).toBeTruthy();
    expect(changes[1].adminUserId).toBeTruthy();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } }) as any).deliveryFeeConfirmedBy).toBe(changes[1].adminName);

    await admin.patch(`/api/v1/admin/orders/${order.id}/payment`).send({ paymentStatus: "PAID" }).expect(200);
    const late = await admin.patch(`/api/v1/admin/orders/${order.id}/delivery-fee`).send({ deliveryFeeQar: 5 });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("DELIVERY_FEE_FINAL");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).deliveryFeeQar).toBe(20);
    // Entering the same figure again is not a change and is not logged.
    const before = (await audit(order.id)).length;
    await admin.patch(`/api/v1/admin/orders/${order.id}/payment`).send({ paymentStatus: "PAID" }).expect(200);
    expect((await audit(order.id)).length).toBe(before);
  });

  it("attributes status, payment and deletion to the admin who did them, and keeps the record after deletion", async () => {
    const order = await placed(200);
    const admin = await loggedInAgent();
    await admin.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: "accepted" }).expect(200);
    await admin.patch(`/api/v1/admin/orders/${order.id}/payment`).send({ paymentStatus: "PAID" }).expect(200);
    await admin.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: "completed" }).expect(200);
    await admin.delete(`/api/v1/admin/orders/${order.id}`).expect(204);
    const entries = await audit(order.id);
    expect(entries.map((entry: { action: string }) => entry.action)).toEqual(["order.status", "order.payment", "order.status", "order.delete"]);
    expect(JSON.parse(entries[1].detail)).toEqual({ from: "PENDING", to: "PAID" });
    for (const entry of entries) {
      expect(entry.orderNumber).toBe(order.orderNumber);
      expect(entry.adminUserId).toBeTruthy();
    }
    const listed = await admin.get(`/api/v1/admin/audit?orderNumber=${order.orderNumber}`).expect(200);
    expect(listed.body.items).toHaveLength(4);
    expect((await request(createApp()).get("/api/v1/admin/audit")).status).toBe(401);
  });

  it("reports merchandise, delivery charges and totals separately", async () => {
    const admin = await loggedInAgent();
    const first = await placed(120); // below the threshold: charge 15
    await admin.patch(`/api/v1/admin/orders/${first.id}/delivery-fee`).send({ deliveryFeeQar: 15 }).expect(200);
    const second = await placed(200); // free delivery
    for (const order of [first, second]) {
      await admin.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: "accepted" }).expect(200);
      await admin.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: "completed" }).expect(200);
    }
    const pending = await admin.get("/api/v1/admin/dashboard").expect(200);
    expect(pending.body).toMatchObject({ pendingPayoutsQar: 335, pendingMerchandiseQar: 320, pendingDeliveryQar: 15 });
    await admin.patch(`/api/v1/admin/orders/${first.id}/payment`).send({ paymentStatus: "PAID" }).expect(200);
    const report = await admin.get("/api/v1/admin/sales").expect(200);
    expect(report.body).toMatchObject({
      orders: 2,
      revenueQar: 320, paidRevenueQar: 120, unpaidRevenueQar: 200, // merchandise, as before
      merchandiseQar: 320, deliveryQar: 15, totalQar: 335, paidTotalQar: 135, unpaidTotalQar: 200,
    });
    expect(report.body.byDay[0]).toMatchObject({ orders: 2, revenueQar: 320, deliveryQar: 15, totalQar: 335 });
  });
});
