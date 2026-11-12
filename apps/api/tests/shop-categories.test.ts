import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { canonicalCategory, categoryName, compareCategories, orderedCategoryCounts, SHOP_CATEGORIES } from "../src/lib/shop-categories";

describe("shop categories", () => {
  it("are in the client's order", () => {
    expect(SHOP_CATEGORIES.map((category) => category.en)).toEqual(["Indoor Plants", "Tabletop Plants", "Gift Plants", "Outdoor Plants", "Pots", "Garden Accessories"]);
  });

  it("keep stored names but show the customer-facing ones, in both languages", () => {
    expect(categoryName("Table Top Plants", "en")).toBe("Tabletop Plants");
    expect(categoryName("Table Top Plants", "ar")).toBe("نباتات مكتبية");
    expect(categoryName("Herbs", "en")).toBe("Herbs");
    expect(categoryName("Herbs", "ar", "أعشاب")).toBe("أعشاب");
  });

  it("map older and display names to the stored category, without merging unrelated ones", () => {
    expect(canonicalCategory("Tabletop Plants")).toBe("Table Top Plants");
    expect(canonicalCategory("Table Tops")).toBe("Table Top Plants");
    expect(canonicalCategory("gift a plant")).toBe("Gift Plants");
    expect(canonicalCategory("نباتات خارجية")).toBe("Outdoor Plants");
    expect(canonicalCategory("Indoor")).toBe("Indoor");
  });

  it("list every category in order, empty ones included, and others after them", () => {
    const listed = orderedCategoryCounts({ "Garden Accessories": 4, "Table Top Plants": 28, Herbs: 2, "Indoor Plants": 76, "Gift Plants": 4, "Outdoor Plants": 5 });
    expect(listed).toEqual([
      { category: "Indoor Plants", count: 76 },
      { category: "Table Top Plants", count: 28 },
      { category: "Gift Plants", count: 4 },
      { category: "Outdoor Plants", count: 5 },
      { category: "Pots", count: 0 },
      { category: "Garden Accessories", count: 4 },
      { category: "Herbs", count: 2 },
    ]);
    expect(["Pots", "Indoor Plants", "Zebra"].sort(compareCategories)).toEqual(["Indoor Plants", "Pots", "Zebra"]);
  });
});

describe("category links", () => {
  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.adminUser.deleteMany();
    await seedDatabase();
  });
  afterAll(() => prisma.$disconnect());

  it("accept the display name as well as the stored one", async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { published: true } });
    await prisma.product.update({ where: { id: product.id }, data: { category: "Table Top Plants" } });
    const stored = await request(createApp()).get("/api/v1/products?category=" + encodeURIComponent("Table Top Plants"));
    const shown = await request(createApp()).get("/api/v1/products?category=" + encodeURIComponent("Tabletop Plants"));
    expect(stored.body.totalItems).toBe(1);
    expect(shown.body.items.map((item: { id: string }) => item.id)).toEqual([product.id]);
  });
});
