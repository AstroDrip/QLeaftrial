import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { inventoryFor, loggedInAgent, resetDatabase, seededProduct } from "./helpers";

describe("admin product management", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("rejects anonymous product management requests", async () => {
    const response = await request(createApp()).get("/api/v1/admin/products");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("lists persisted integer prices and stock for an authenticated admin", async () => {
    const agent = await loggedInAgent();
    const response = await agent.get("/api/v1/admin/products");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.items).toContainEqual(
      expect.objectContaining({
        slug: "house-plant",
        name: "House Plant",
        priceQar: 180,
        stock: 12,
      }),
    );
  });

  it("persists price and inventory together and exposes them publicly", async () => {
    const product = await seededProduct("house-plant");
    const agent = await loggedInAgent();

    const updated = await agent
      .patch(`/api/v1/admin/products/${product.id}`)
      .send({ priceQar: 215, stock: 7 });

    expect(updated.status).toBe(200);
    expect(updated.body).toEqual(
      expect.objectContaining({ id: product.id, priceQar: 215, stock: 7 }),
    );
    expect(await prisma.product.findUnique({ where: { id: product.id } }))
      .toMatchObject({ priceQar: 215 });
    expect(await inventoryFor(product.id)).toMatchObject({ quantity: 7 });

    const publicResponse = await request(createApp())
      .get("/api/v1/products/house-plant");
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body).toEqual(
      expect.objectContaining({ priceQar: 215, stock: 7, inStock: true }),
    );
  });

  it.each([
    [{ priceQar: 12.5 }, "decimal price"],
    [{ stock: -1 }, "negative stock"],
    [{}, "empty patch"],
  ])("rejects invalid updates: %s (%s)", async (body) => {
    const product = await seededProduct("house-plant");
    const agent = await loggedInAgent();

    const response = await agent
      .patch(`/api/v1/admin/products/${product.id}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
