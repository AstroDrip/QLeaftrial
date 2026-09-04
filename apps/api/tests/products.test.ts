import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("product catalogue", () => {
  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.adminUser.deleteMany();
    await seedDatabase();
  });

  afterAll(() => prisma.$disconnect());

  it("filters published products and excludes admin-only fields", async () => {
    const response = await request(createApp()).get("/api/v1/products?q=house");

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toEqual(expect.objectContaining({
      slug: "house-plant", priceQar: 180, inStock: true,
    }));
    expect(response.body.items[0]).not.toHaveProperty("costPrice");
  });

  it("returns a product detail without AR metadata", async () => {
  const response = await request(createApp()).get("/api/v1/products/house-plant");

  expect(response.status).toBe(200);
  expect(response.body).toEqual(
    expect.objectContaining({
      slug: "house-plant",
      priceQar: 180,
      inStock: true,
    }),
  );
  expect(response.body).not.toHaveProperty("arAsset");
});

  it("filters by category and light while excluding unpublished products", async () => {
    await prisma.product.create({
      data: {
        slug: "unpublished-house-plant",
        sku: "QL-UHP-001",
        name: "Unpublished House Plant",
        description: "This product must remain private.",
        category: "Indoor",
        light: "Bright indirect",
        priceQar: 1,
        costPrice: 1,
        published: false,
      },
    });

    const response = await request(createApp())
      .get("/api/v1/products?category=Indoor&light=Bright%20indirect&page=1");

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.map((product: { slug: string }) => product.slug))
      .toEqual(expect.arrayContaining(["house-plant", "fiddle-leaf-fig"]));
    expect(response.body.items.map((product: { slug: string }) => product.slug))
      .not.toContain("unpublished-house-plant");
  });

  it("returns the public error shape when a product is absent", async () => {
    const response = await request(createApp()).get("/api/v1/products/missing-plant");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: expect.objectContaining({ code: "PRODUCT_NOT_FOUND", message: expect.any(String) }),
    });
  });
});
