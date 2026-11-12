import { describe, expect, it } from "vitest";
import type { CatalogueProduct } from "./catalogue-types";
import { catalogueListResponse } from "./catalogue-view";

function product(overrides: Partial<CatalogueProduct> & Pick<CatalogueProduct, "id" | "slug" | "name">): CatalogueProduct {
  return {
    nameAr: null,
    description: "A plant.",
    descriptionAr: null,
    category: "Indoor Plants",
    categoryAr: "نباتات داخلية",
    light: null,
    lightAr: null,
    priceQar: 99,
    stock: 10,
    inStock: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    image: null,
    media: [],
    ...overrides,
  } as CatalogueProduct;
}

const products = [
  product({ id: "1", slug: "peace-lily", name: "Peace Lily", nameAr: "زنبقة السلام", description: "Pairs well with a snake plant." }),
  product({ id: "2", slug: "snake-plant", name: "Snake Plant", nameAr: "نبات الثعبان", searchAliases: "sansevieria", createdAt: "2026-10-01T00:00:00.000Z" }),
  product({ id: "3", slug: "aloe-vera", name: "Aloe Vera", nameAr: "ألوفيرا", category: "Succulents" }),
];

const slugs = (params: Parameters<typeof catalogueListResponse>[1]) => catalogueListResponse(products, params).items.map((item) => item.slug);

describe("searching the saved catalogue", () => {
  it("puts the best match first, using the same ranking as the API", () => {
    expect(slugs({ q: "SNAKE" })).toEqual(["snake-plant", "peace-lily"]);
  });

  it("matches aliases, Arabic variants and typos", () => {
    expect(slugs({ q: "sansevieria" })).toEqual(["snake-plant"]);
    expect(slugs({ q: "الوفيرا" })).toEqual(["aloe-vera"]);
    expect(slugs({ q: "alo vera" })[0]).toBe("aloe-vera");
  });

  it("keeps a sort the customer chose, and other filters", () => {
    expect(slugs({ q: "snake", sort: "newest" })).toEqual(["peace-lily", "snake-plant"]);
    expect(slugs({ q: "aloe", category: "Indoor Plants" })).toEqual([]);
  });

  it("lists everything, newest first, without a search", () => {
    // Same date: the slug breaks the tie, as in the API.
    expect(slugs({})).toEqual(["aloe-vera", "peace-lily", "snake-plant"]);
  });
});
