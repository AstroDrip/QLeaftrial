import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { clearLoginAttempts } from "../src/modules/auth/login-rate-limit";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

// Failure scenarios from production: a database that is down or slow, retried checkouts, a second admin.

describe("admin login", () => {
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await resetDatabase();
    await clearLoginAttempts();
    await seedDatabase();
  });

  it("accepts the password of any admin account, not only the oldest one", async () => {
    await prisma.adminUser.create({
      data: { email: "second-admin@qleaves.local", name: "Second Admin", passwordHash: await argon2.hash("a-second-password") },
    });

    const second = await request(createApp()).post("/api/v1/auth/login").send({ password: "a-second-password" });
    const first = await request(createApp()).post("/api/v1/auth/login").send({ password: "taimuomar" });
    const wrong = await request(createApp()).post("/api/v1/auth/login").send({ password: "not-a-password" });

    expect(second.status).toBe(200);
    expect(second.body.admin).toEqual({ name: "Second Admin" });
    expect(first.status).toBe(200);
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("placing an order exactly once", () => {
  beforeEach(resetDatabase);

  it("returns the same order when a checkout is retried with the same key", async () => {
    const product = await seededProduct("house-plant");
    const body = validOrder({ items: [{ productId: product.id, quantity: 1 }] });
    const app = createApp();

    const first = await request(app).post("/api/v1/orders").set("Idempotency-Key", "checkout-retry-0001").send(body);
    const retry = await request(app).post("/api/v1/orders").set("Idempotency-Key", "checkout-retry-0001").send(body);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.orderNumber).toBe(first.body.orderNumber);
    expect(await prisma.order.count()).toBe(1);
    // Stock was taken once, not twice.
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity).toBe(11);
  });

  it("creates one order when a double tap sends two requests at the same moment", async () => {
    const product = await seededProduct("house-plant");
    const body = validOrder({ items: [{ productId: product.id, quantity: 1 }] });
    const app = createApp();

    const [a, b] = await Promise.all([
      request(app).post("/api/v1/orders").set("Idempotency-Key", "double-tap-key-0001").send(body),
      request(app).post("/api/v1/orders").set("Idempotency-Key", "double-tap-key-0001").send(body),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.order.count()).toBe(1);
  });

  it("keeps separate checkouts separate, and refuses a malformed key", async () => {
    const product = await seededProduct("house-plant");
    const body = validOrder({ items: [{ productId: product.id, quantity: 1 }] });
    const app = createApp();

    const one = await request(app).post("/api/v1/orders").set("Idempotency-Key", "checkout-one-00001").send(body);
    const two = await request(app).post("/api/v1/orders").set("Idempotency-Key", "checkout-two-00002").send(body);
    const bad = await request(app).post("/api/v1/orders").set("Idempotency-Key", "x").send(body);

    expect(one.body.id).not.toBe(two.body.id);
    expect(one.body.orderNumber).not.toBe(two.body.orderNumber);
    expect(bad.status).toBe(400);
    expect(await prisma.order.count()).toBe(2);
  });

  it("gives every order a distinct number even when many arrive at once", async () => {
    const product = await seededProduct("house-plant");
    await prisma.inventory.update({ where: { productId: product.id }, data: { quantity: 100 } });
    const body = validOrder({ items: [{ productId: product.id, quantity: 1 }] });
    const app = createApp();

    const responses = await Promise.all(Array.from({ length: 8 }, () => request(app).post("/api/v1/orders").send(body)));

    expect(responses.every((response) => response.status === 201)).toBe(true);
    const numbers = responses.map((response) => response.body.orderNumber as string);
    expect(new Set(numbers).size).toBe(8);
    for (const number of numbers) expect(number).toMatch(/^QL-\d{8}-[0-9A-Z]{6}$/);
  });

  it("charges database prices whatever price the client sends, and rejects a tampered total", async () => {
    const product = await seededProduct("house-plant");
    const app = createApp();

    const lowPrice = await request(app).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 2, unitPriceQar: 1 }] }));
    const tamperedTotal = await request(app).post("/api/v1/orders").send({
      ...validOrder({ items: [{ productId: product.id, quantity: 1 }] }),
      subtotalQar: 1,
    });

    expect(lowPrice.status).toBe(201);
    expect(lowPrice.body.subtotalQar).toBe(product.priceQar * 2);
    expect(lowPrice.body.items[0].unitPriceQar).toBe(product.priceQar);
    expect(tamperedTotal.status).toBe(400);
    expect(await prisma.order.count()).toBe(1);
  });

  it("refuses an unpublished product and an unknown product without saving anything", async () => {
    const product = await seededProduct("house-plant");
    await prisma.product.update({ where: { id: product.id }, data: { published: false } });

    const unpublished = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
    const unknown = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: "no-such-product", quantity: 1 }] }));
    const negative = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: -1 }] }));

    expect(unpublished.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(negative.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });

  it("lets only one of two customers buy the last item", async () => {
    const product = await seededProduct("house-plant");
    await prisma.inventory.update({ where: { productId: product.id }, data: { quantity: 1 } });
    const body = validOrder({ items: [{ productId: product.id, quantity: 1 }] });
    const app = createApp();

    const results = await Promise.all([
      request(app).post("/api/v1/orders").send(body),
      request(app).post("/api/v1/orders").send(body),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity).toBe(0);
  });
});

describe("public catalogue and settings", () => {
  beforeEach(resetDatabase);

  it("serves only published products with customer-safe fields, cached at the edge", async () => {
    const hidden = await seededProduct("house-plant");
    await prisma.product.update({ where: { id: hidden.id }, data: { published: false } });

    const response = await request(createApp()).get("/api/v1/catalogue");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("s-maxage=60");
    expect(response.headers["cache-control"]).toContain("stale-while-revalidate");
    expect(response.body.productCount).toBe(response.body.products.length);
    expect(response.body.products.some((product: { id: string }) => product.id === hidden.id)).toBe(false);
    expect(JSON.stringify(response.body)).not.toContain("costPrice");
    expect(typeof response.body.version).toBe("string");
  });

  it("changes the catalogue version when an admin edits a product", async () => {
    const product = await seededProduct("snake-plant");
    const before = (await request(createApp()).get("/api/v1/catalogue")).body.version;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const agent = await loggedInAgent();

    const edited = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ priceQar: product.priceQar + 5 });
    const after = (await request(createApp()).get("/api/v1/catalogue")).body;

    expect(edited.status).toBe(200);
    expect(after.version).not.toBe(before);
    expect(after.products.find((item: { id: string }) => item.id === product.id).priceQar).toBe(product.priceQar + 5);
  });

  it("gives admins an uncached settings read, and only to admins", async () => {
    const anonymous = await request(createApp()).get("/api/v1/admin/storefront-settings");
    const agent = await loggedInAgent();
    const admin = await agent.get("/api/v1/admin/storefront-settings");

    expect(anonymous.status).toBe(401);
    expect(admin.status).toBe(200);
    expect(admin.headers["cache-control"]).toBe("no-store");
    expect(admin.body).toHaveProperty("orderingEnabled");
  });
});
