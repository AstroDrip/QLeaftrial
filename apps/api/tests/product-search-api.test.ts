import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("product search through the API", () => {
  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.adminUser.deleteMany();
    await seedDatabase();
  });

  afterAll(() => prisma.$disconnect());

  it("finds the real product records in any letter case, and never returns internal fields", async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { published: true }, orderBy: { slug: "asc" } });
    const word = product.name.split(" ")[0];
    for (const query of [word.toLowerCase(), word.toUpperCase()]) {
      const response = await request(createApp()).get(`/api/v1/products?q=${encodeURIComponent(query)}`);
      expect(response.status).toBe(200);
      expect(response.body.items.map((item: { slug: string }) => item.slug)).toContain(product.slug);
      for (const item of response.body.items) {
        for (const field of ["costPrice", "searchAliases", "needsReview", "reviewNote", "sku"]) expect(item).not.toHaveProperty(field);
      }
    }
  });

  it("searches aliases maintained in admin, and picks up an alias change straight away", async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { published: true }, orderBy: { slug: "asc" } });
    const before = await request(createApp()).get("/api/v1/products?q=zanzibar");
    expect(before.body.totalItems).toBe(0);

    await prisma.product.update({ where: { id: product.id }, data: { searchAliases: "zanzibar gem, زاميا" } });
    const english = await request(createApp()).get("/api/v1/products?q=zanzibar");
    expect(english.body.items[0].slug).toBe(product.slug);
    const arabic = await request(createApp()).get(`/api/v1/products?q=${encodeURIComponent("زاميا")}`);
    expect(arabic.body.items[0].slug).toBe(product.slug);
  });

  it("does not search unpublished products", async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { published: true }, orderBy: { slug: "asc" } });
    await prisma.product.update({ where: { id: product.id }, data: { published: false, searchAliases: "hiddenword" } });
    const response = await request(createApp()).get("/api/v1/products?q=hiddenword");
    expect(response.body.totalItems).toBe(0);
  });

  it("ranks by relevance by default, keeps a chosen sort, and still applies the other filters", async () => {
    const products = await prisma.product.findMany({ where: { published: true }, orderBy: { slug: "asc" } });
    const [target] = products;
    await prisma.product.update({ where: { id: target.id }, data: { searchAliases: "qleavesprobe" } });
    const others = products.slice(1, 3);
    for (const other of others) await prisma.product.update({ where: { id: other.id }, data: { description: `${other.description} Mentions qleavesprobe once.` } });

    const ranked = await request(createApp()).get("/api/v1/products?q=qleavesprobe");
    expect(ranked.body.items[0].slug).toBe(target.slug);
    expect(ranked.body.totalItems).toBe(1 + others.length);

    const byPrice = await request(createApp()).get("/api/v1/products?q=qleavesprobe&sort=price-desc");
    const prices = byPrice.body.items.map((item: { priceQar: number }) => item.priceQar);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));

    const category = await request(createApp()).get(`/api/v1/products?q=qleavesprobe&category=${encodeURIComponent(target.category)}`);
    for (const item of category.body.items) expect(item.category).toBe(target.category);
    expect(category.body.items.map((item: { slug: string }) => item.slug)).toContain(target.slug);
  });

  it("answers an empty search with the normal list and a nonsense search with nothing", async () => {
    const all = await request(createApp()).get("/api/v1/products?q=");
    expect(all.status).toBe(200);
    expect(all.body.totalItems).toBeGreaterThan(0);
    const none = await request(createApp()).get("/api/v1/products?q=xqzvw");
    expect(none.body).toEqual(expect.objectContaining({ items: [], totalItems: 0 }));
  });
});
