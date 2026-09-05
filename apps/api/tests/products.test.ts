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
      slug: "house-plant", priceQar: 180, stock: 12, inStock: true,
    }));
    expect(response.body.items[0]).not.toHaveProperty("costPrice");
    expect(response.body).toEqual(expect.objectContaining({
      page: 1,
      pageSize: 24,
      totalItems: 1,
      totalPages: 1,
    }));
  });

  it("returns a product detail without AR metadata", async () => {
  const response = await request(createApp()).get("/api/v1/products/house-plant");

  expect(response.status).toBe(200);
  expect(response.body).toEqual(
    expect.objectContaining({
      slug: "house-plant",
      priceQar: 180,
      stock: 12,
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

  it("compresses JSON responses and sets cache headers for product catalogue routes", async () => {
    const listResponse = await request(createApp())
      .get("/api/v1/products?page=1")
      .set("Accept-Encoding", "gzip");

    expect(listResponse.status).toBe(200);
    expect(listResponse.headers["content-encoding"]).toBe("gzip");
    expect(listResponse.headers["cache-control"]).toContain("public");
    expect(listResponse.headers["cache-control"]).toContain("max-age=60");

    const detailResponse = await request(createApp())
      .get("/api/v1/products/house-plant")
      .set("Accept-Encoding", "gzip");

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.headers["cache-control"]).toContain("max-age=120");
  });

  it("returns the public error shape when a product is absent", async () => {
    const response = await request(createApp()).get("/api/v1/products/missing-plant");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: expect.objectContaining({ code: "PRODUCT_NOT_FOUND", message: expect.any(String) }),
    });
  });

  it("sorts the complete result set before applying pagination", async () => {
    const response = await request(createApp()).get(
      "/api/v1/products?sort=price-desc&page=1",
    );

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toEqual(expect.objectContaining({
      slug: "fiddle-leaf-fig",
      priceQar: 260,
    }));
  });

  it("uses a stable slug tie-breaker for equal prices", async () => {
    await prisma.product.createMany({
      data: [
        {
          slug: "z-equal-price",
          sku: "QL-ZEP-001",
          name: "Z Equal Price",
          description: "Price sorting fixture.",
          category: "Indoor",
          light: "Indirect",
          priceQar: 90,
          costPrice: 40,
          published: true,
        },
        {
          slug: "a-equal-price",
          sku: "QL-AEP-001",
          name: "A Equal Price",
          description: "Price sorting fixture.",
          category: "Indoor",
          light: "Indirect",
          priceQar: 90,
          costPrice: 40,
          published: true,
        },
      ],
    });

    const response = await request(createApp()).get(
      "/api/v1/products?sort=price-asc&page=1",
    );
    const tiedSlugs = response.body.items
      .filter((product: { priceQar: number }) => product.priceQar === 90)
      .map((product: { slug: string }) => product.slug);

    expect(tiedSlugs).toEqual(["a-equal-price", "z-equal-price"]);
  });

  it("returns filter metadata independently of catalogue pagination", async () => {
    await prisma.product.create({
      data: {
        slug: "patio-palm",
        sku: "QL-PP-100",
        name: "Patio Palm",
        description: "A published outdoor plant.",
        category: "Outdoor",
        light: "Full sun",
        priceQar: 300,
        costPrice: 150,
        published: true,
      },
    });

    const response = await request(createApp()).get("/api/v1/products/filters");

    expect(response.status).toBe(200);
    expect(response.body.categories).toContain("Outdoor");
    expect(response.body.lights).toContain("Full sun");
  });
});
