import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { inventoryFor, loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

// Fake orders end to end, against the isolated SQLite test database only (QLEAVES_SQLITE_URL / test.db,
// see tests/use-test-database.ts). Every step is checked in the database, not just in the API answer.
// No payment, email, WhatsApp or courier service is ever called: none is wired to order creation, and the
// Google Sheet mirror is off unless its credentials are configured.

describe("fake orders, from the catalogue to delivery", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("runs a whole order: browse, order two products, accept, take payment, deliver", async () => {
    // The test database really is the isolated one.
    expect(process.env.QLEAVES_DATABASE_PROVIDER).toBe("sqlite");

    const a = await seededProduct("snake-plant");
    const b = await prisma.product.findUniqueOrThrow({ where: { slug: "aloe-vera" } });
    const app = createApp();

    const listing = await request(app).get("/api/v1/products?page=1");
    expect(listing.body.items.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    const stockA = (await inventoryFor(a.id)).quantity;
    const stockB = (await inventoryFor(b.id)).quantity;

    const placed = await request(app).post("/api/v1/orders").set("Idempotency-Key", "journey-order-0001").send(validOrder({
      paymentMethod: "PAYMENT_LINK",
      items: [{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 1 }, { productId: a.id, quantity: 1 }],
    }));
    expect(placed.status).toBe(201);

    // Persisted exactly once, with server prices, merged quantities and snapshots.
    const order = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id }, include: { items: true } });
    expect(await prisma.order.count()).toBe(1);
    expect(order).toMatchObject({ status: "PENDING", paymentStatus: "PENDING", paymentMethod: "PAYMENT_LINK", deliveryFeeQar: 0, area: "Doha" });
    expect(order.subtotalQar).toBe(a.priceQar * 3 + b.priceQar);
    const lineA = order.items.find((item) => item.productId === a.id)!;
    expect(lineA).toMatchObject({ quantity: 3, unitPriceQar: a.priceQar, productName: a.name, sku: a.sku });
    expect(order.items).toHaveLength(2);
    expect((await inventoryFor(a.id)).quantity).toBe(stockA - 3);
    expect((await inventoryFor(b.id)).quantity).toBe(stockB - 1);

    // A later price change never rewrites the order.
    await prisma.product.update({ where: { id: a.id }, data: { priceQar: a.priceQar + 100 } });
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: lineA.id } })).unitPriceQar).toBe(a.priceQar);

    const admin = await loggedInAgent();
    expect((await admin.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: "accepted" })).body.status).toBe("CONFIRMED");
    expect((await admin.patch(`/api/v1/admin/orders/${order.id}/payment`).send({ paymentStatus: "PAID" })).status).toBe(200);
    expect((await admin.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: "completed" })).body.status).toBe("DELIVERED");

    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(final).toMatchObject({ status: "DELIVERED", paymentStatus: "PAID" });
    // Delivered stock stays sold; a delivered order cannot be reopened.
    expect((await inventoryFor(a.id)).quantity).toBe(stockA - 3);
    expect((await admin.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: "pending" })).status).toBe(409);
    expect(await prisma.orderItem.count({ where: { orderId: { not: order.id } } })).toBe(0);
  });

  it("records a failed payment without touching the order lines or stock, and allows a retry to succeed", async () => {
    const product = await seededProduct("snake-plant");
    const placed = await request(createApp()).post("/api/v1/orders").send(validOrder({ paymentMethod: "PAYMENT_LINK", items: [{ productId: product.id, quantity: 1 }] }));
    const stock = (await inventoryFor(product.id)).quantity;
    const admin = await loggedInAgent();

    await admin.patch(`/api/v1/admin/orders/${placed.body.id}/payment`).send({ paymentStatus: "FAILED" });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } })).toMatchObject({ paymentStatus: "FAILED", status: "PENDING" });
    expect((await inventoryFor(product.id)).quantity).toBe(stock);

    await admin.patch(`/api/v1/admin/orders/${placed.body.id}/payment`).send({ paymentStatus: "PAID" });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } })).toMatchObject({ paymentStatus: "PAID" });
    const invalid = await admin.patch(`/api/v1/admin/orders/${placed.body.id}/payment`).send({ paymentStatus: "REFUNDED" });
    expect(invalid.status).toBe(400);
  });

  it("puts the stock back exactly once when an order is cancelled", async () => {
    const product = await seededProduct("snake-plant");
    const before = (await inventoryFor(product.id)).quantity;
    const placed = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 2 }] }));
    expect((await inventoryFor(product.id)).quantity).toBe(before - 2);
    const admin = await loggedInAgent();

    await admin.patch(`/api/v1/admin/orders/${placed.body.id}/status`).send({ status: "declined" });
    const again = await admin.patch(`/api/v1/admin/orders/${placed.body.id}/status`).send({ status: "declined" });

    // Declining again is a harmless no-op: the stock is not returned a second time.
    expect([200, 409]).toContain(again.status);
    expect((await inventoryFor(product.id)).quantity).toBe(before);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } })).toMatchObject({ status: "CANCELLED" });
  });

  it("refuses empty carts, zero or huge quantities, unknown areas and bad contact details, saving nothing", async () => {
    const product = await seededProduct("snake-plant");
    const stock = (await inventoryFor(product.id)).quantity;
    const app = createApp();
    const attempts = [
      validOrder({ items: [] }),
      validOrder({ items: [{ productId: product.id, quantity: 0 }] }),
      validOrder({ items: [{ productId: product.id, quantity: 101 }] }),
      validOrder({ items: [{ productId: product.id, quantity: 1.5 }] }),
      { ...validOrder({ items: [{ productId: product.id, quantity: 1 }] }), area: "The Moon" },
      { ...validOrder({ items: [{ productId: product.id, quantity: 1 }] }), email: "not-an-email" },
      { ...validOrder({ items: [{ productId: product.id, quantity: 1 }] }), phone: "1" },
      { ...validOrder({ items: [{ productId: product.id, quantity: 1 }] }), paymentMethod: "CRYPTO" },
    ];

    for (const body of attempts) {
      const response = await request(app).post("/api/v1/orders").send(body);
      expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect(await prisma.order.count()).toBe(0);
    expect((await inventoryFor(product.id)).quantity).toBe(stock);
  });

  it("accepts the delivery area in Arabic, as the Arabic checkout sends it", async () => {
    const product = await seededProduct("snake-plant");
    const response = await request(createApp()).post("/api/v1/orders").send({ ...validOrder({ items: [{ productId: product.id, quantity: 1 }] }), area: "الوكرة" });
    expect(response.status).toBe(201);
    expect(response.body.area).toBe("الوكرة");
  });

  it("rolls the whole order back when one line runs out of stock, leaving the other products untouched", async () => {
    const plenty = await seededProduct("snake-plant");
    const scarce = await prisma.product.findUniqueOrThrow({ where: { slug: "aloe-vera" } });
    await prisma.inventory.update({ where: { productId: scarce.id }, data: { quantity: 1 } });
    const plentyBefore = (await inventoryFor(plenty.id)).quantity;

    const response = await request(createApp()).post("/api/v1/orders").send(validOrder({
      items: [{ productId: plenty.id, quantity: 2 }, { productId: scarce.id, quantity: 3 }],
    }));

    expect(response.status).toBe(409);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderItem.count()).toBe(0);
    expect((await inventoryFor(plenty.id)).quantity).toBe(plentyBefore);
    expect((await inventoryFor(scarce.id)).quantity).toBe(1);
  });

  it("refuses a product unpublished while it sat in the cart", async () => {
    const product = await seededProduct("snake-plant");
    await prisma.product.update({ where: { id: product.id }, data: { published: false } });
    const response = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    expect(response.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });

  it("keeps every order and payment action behind the admin login", async () => {
    const product = await seededProduct("snake-plant");
    const placed = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    const app = createApp();

    const attempts = await Promise.all([
      request(app).get("/api/v1/admin/orders"),
      request(app).patch(`/api/v1/admin/orders/${placed.body.id}/status`).send({ status: "completed" }),
      request(app).patch(`/api/v1/admin/orders/${placed.body.id}/payment`).send({ paymentStatus: "PAID" }),
      request(app).delete(`/api/v1/admin/orders/${placed.body.id}`),
      request(app).get("/api/v1/admin/products"),
    ]);

    expect(attempts.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: placed.body.id } })).toMatchObject({ status: "PENDING", paymentStatus: "PENDING" });
  });
});
