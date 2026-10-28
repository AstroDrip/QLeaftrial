import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { loggedInAgent, resetDatabase, seededProduct } from "./helpers";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=";

describe("admin product editing", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("edits English details and cost without touching Arabic copy", async () => {
    const product = await seededProduct("house-plant");
    const agent = await loggedInAgent();

    const response = await agent.patch(`/api/v1/admin/products/${product.id}`).send({
      name: "Rubber Plant",
      description: "A glossy, easy-care plant for bright rooms.",
      category: "Table tops",
      light: "Bright indirect",
      costPrice: 70,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: "Rubber Plant", category: "Table tops", light: "Bright indirect", costPrice: 70 });
    const stored = await prisma.product.findUnique({ where: { id: product.id } });
    expect(stored).toMatchObject({ name: "Rubber Plant", nameAr: product.nameAr, slug: "house-plant" });
  });

  it("clears light needs for non-plant products", async () => {
    const product = await seededProduct("house-plant");
    const agent = await loggedInAgent();

    const response = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ light: null });

    expect(response.status).toBe(200);
    expect(response.body.light).toBeNull();
    const filters = await request(createApp()).get("/api/v1/products/filters");
    expect(filters.body.lights).not.toContain(null);
  });

  it("rejects blank English names", async () => {
    const product = await seededProduct("house-plant");
    const agent = await loggedInAgent();

    const response = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ name: " " });

    expect(response.status).toBe(400);
  });

  it("replaces a product's photos", async () => {
    const product = await seededProduct("house-plant");
    const agent = await loggedInAgent();

    const response = await agent.put(`/api/v1/admin/products/${product.id}/images`).send({
      imageDataUrl: PNG,
      imageAltText: "Rubber plant in a white pot",
    });

    expect(response.status).toBe(200);
    expect(response.body.image).toEqual({ url: PNG, altText: "Rubber plant in a white pot" });
    const media = await prisma.productMedia.findMany({ where: { productId: product.id } });
    expect(media).toHaveLength(1);
  });

  it("requires a login and an existing product to replace photos", async () => {
    const anonymous = await request(createApp()).put("/api/v1/admin/products/x/images").send({ imageDataUrl: PNG, imageAltText: "Plant" });
    expect(anonymous.status).toBe(401);

    const agent = await loggedInAgent();
    const missing = await agent.put("/api/v1/admin/products/missing/images").send({ imageDataUrl: PNG, imageAltText: "Plant" });
    expect(missing.status).toBe(404);
  });
});

describe("catalogue filters for large catalogues", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("filters by price range and stock, and counts products per category", async () => {
    const product = await seededProduct("house-plant");
    await prisma.inventory.update({ where: { productId: product.id }, data: { quantity: 0 } });

    const priced = await request(createApp()).get("/api/v1/products?minPrice=100&maxPrice=200");
    expect(priced.status).toBe(200);
    for (const item of priced.body.items) {
      expect(item.priceQar).toBeGreaterThanOrEqual(100);
      expect(item.priceQar).toBeLessThanOrEqual(200);
    }

    const inStock = await request(createApp()).get("/api/v1/products?inStock=1");
    expect(inStock.body.items.map((item: { slug: string }) => item.slug)).not.toContain("house-plant");

    const filters = await request(createApp()).get("/api/v1/products/filters");
    const total = Object.values(filters.body.categoryCounts as Record<string, number>).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(await prisma.product.count({ where: { published: true } }));
  });
});
