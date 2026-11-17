import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { clearOrderRateLimit } from "../src/modules/orders/order-rate-limit";
import { inventoryFor, resetDatabase, seededProduct, validOrder } from "./helpers";

// The server half of "an order is never lost, duplicated or falsely confirmed": every order has a key, the same key
// always means the same order, and nothing is charged at a price the customer did not see.
describe("order keys, fingerprints and prices", () => {
  beforeEach(async () => { await resetDatabase(); await clearOrderRateLimit(); });
  afterAll(() => prisma.$disconnect());

  async function setup(priceQar = 120) {
    const product = await seededProduct("house-plant");
    await prisma.product.update({ where: { id: product.id }, data: { priceQar } });
    await prisma.inventory.update({ where: { productId: product.id }, data: { quantity: 50 } });
    return { product, body: validOrder({ items: [{ productId: product.id, quantity: 2 }] }) };
  }
  const post = (body: unknown, key?: string) => {
    const call = request(createApp()).post("/api/v1/orders");
    if (key !== undefined) call.set("Idempotency-Key", key);
    return call.send(body as object);
  };

  it("refuses an order without a valid key, before anything is written", async () => {
    const { product, body } = await setup();
    for (const key of [undefined, "", "short", "has spaces in it 0000", "x".repeat(81)]) {
      const response = await post(body, key);
      expect(response.status, String(key)).toBe(400);
      expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    }
    expect(await prisma.order.count()).toBe(0);
    expect((await inventoryFor(product.id)).quantity).toBe(50);
  });

  it("returns the same order for the same key and request, and refuses the key with a different request", async () => {
    const { product, body } = await setup();
    const first = await post(body, "checkout-key-reuse-0001");
    expect(first.status).toBe(201);
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(stored.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);

    // Same request again (whitespace the server trims anyway does not matter).
    const again = await post({ ...body, customerName: `  ${body.customerName}  ` }, "checkout-key-reuse-0001");
    expect(again.status).toBe(200);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(again.body).toEqual(first.body);

    for (const changed of [{ ...body, items: [{ productId: product.id, quantity: 3 }] }, { ...body, phone: "+974 5555 9999" }]) {
      const conflict = await post(changed, "checkout-key-reuse-0001");
      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
      expect(JSON.stringify(conflict.body)).not.toContain(first.body.orderNumber);
    }
    expect(await prisma.order.count()).toBe(1);
    expect((await inventoryFor(product.id)).quantity).toBe(48);
  });

  it("answers an order saved before fingerprints were recorded, for its key", async () => {
    const { body } = await setup();
    const first = await post(body, "checkout-old-order-0001");
    await prisma.order.update({ where: { id: first.body.id }, data: { requestFingerprint: null } });
    const again = await post(body, "checkout-old-order-0001");
    expect(again.status).toBe(200);
    expect(again.body.orderNumber).toBe(first.body.orderNumber);
  });

  it("never locks a customer out of their own confirmation: replays do not count against new orders", async () => {
    const { body } = await setup(200);
    expect((await post(body, "checkout-replays-0001")).status).toBe(201);
    for (let index = 0; index < 15; index += 1) expect((await post(body, "checkout-replays-0001")).status).toBe(200);
    // The limit on new orders is untouched by those replays: nine more new orders still go through.
    for (let index = 0; index < 9; index += 1) expect((await post(body, `checkout-more-orders-${index}0000`)).status, `order ${index}`).toBe(201);
    const limited = await post(body, "checkout-one-too-many-0001");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    // Even then, an existing order is still recovered.
    expect((await post(body, "checkout-replays-0001")).status).toBe(200);
  });

  it("does not place an order at a price the customer did not see, and says what changed", async () => {
    const { product, body } = await setup(120);
    const changed = await post({ ...body, expectedSubtotalQar: 200 }, "checkout-old-price-0001");
    expect(changed.status).toBe(409);
    expect(changed.body.error).toMatchObject({ code: "PRICE_CHANGED", details: { subtotalQar: 240, items: [{ productId: product.id, priceQar: 120 }] } });
    expect(await prisma.order.count()).toBe(0);
    expect((await inventoryFor(product.id)).quantity).toBe(50);

    const agreed = await post({ ...body, expectedSubtotalQar: 240 }, "checkout-new-price-0001");
    expect(agreed.status).toBe(201);
    // A later price change never touches an order already saved: its key still returns it as it was.
    await prisma.product.update({ where: { id: product.id }, data: { priceQar: 300 } });
    const recovered = await post({ ...body, expectedSubtotalQar: 240 }, "checkout-new-price-0001");
    expect(recovered.status).toBe(200);
    expect(recovered.body).toMatchObject({ orderNumber: agreed.body.orderNumber, subtotalQar: 240 });
  });

  it("fails loudly, and places nothing, when the database is missing the key column", async () => {
    const { product, body } = await setup();
    const missing = Object.assign(new Error("The column `Order.idempotencyKey` does not exist in the current database."), { code: "P2022", meta: { column: "Order.idempotencyKey" } });
    // Replaced by hand and put back: undoing a spy on Prisma's client deletes the method instead of restoring it.
    const orders = prisma.order as unknown as { findUnique: (...args: unknown[]) => Promise<unknown> };
    const real = orders.findUnique;
    orders.findUnique = () => Promise.reject(missing);
    try {
      const response = await post(body, "checkout-no-column-0001");
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(response.body.error.code).not.toBe("IDEMPOTENCY_KEY_REUSED");
    } finally {
      orders.findUnique = real;
    }
    expect(await prisma.order.count()).toBe(0);
    expect((await inventoryFor(product.id)).quantity).toBe(50);
  });

  it("runs the order again after a PostgreSQL clash, and still creates exactly one", async () => {
    const { product, body } = await setup();
    const client = prisma as unknown as { $transaction: (...args: unknown[]) => Promise<unknown> };
    const real = client.$transaction.bind(prisma);
    // Only the order's own transaction (the one that records the request fingerprint) fails, once.
    let calls = 0;
    client.$transaction = (...args: unknown[]) => {
      if (String(args[0]).includes("requestFingerprint")) {
        calls += 1;
        if (calls === 1) return Promise.reject(Object.assign(new Error("Transaction failed due to a write conflict or a deadlock. Please retry your transaction"), { code: "P2034" }));
      }
      return real(...args);
    };
    try {
      const response = await post(body, "checkout-deadlock-0001");
      expect(response.status).toBe(201);
    } finally {
      client.$transaction = real;
    }
    expect(calls).toBe(2);
    expect(await prisma.order.count()).toBe(1);
    expect((await inventoryFor(product.id)).quantity).toBe(48);
  });
});
