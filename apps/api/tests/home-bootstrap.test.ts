import { describe, expect, it } from "vitest";
import { buildHomeBootstrap, isHomeBootstrap, type BootstrapSourceProduct } from "../src/lib/home-bootstrap";

const product = (index: number, extra: Partial<BootstrapSourceProduct> = {}): BootstrapSourceProduct & { description: string } => ({
  id: `p${index}`, slug: `plant-${index}`, name: `Plant ${String(index).padStart(3, "0")}`, nameAr: null, category: "Indoor Plants", categoryAr: "نباتات داخلية",
  light: null, lightAr: null, priceQar: 100 + index, stock: 5, inStock: true, createdAt: new Date(Date.UTC(2026, 0, 1) + index * 86_400_000).toISOString(),
  image: { url: `/media/${index}-640.webp`, altText: `Plant ${index}`, width: 640, height: 800, purpose: "catalogue", sortOrder: 0 },
  description: "A long description that the homepage never shows. ".repeat(20),
  ...extra,
});

describe("homepage bootstrap", () => {
  const products = [
    ...Array.from({ length: 300 }, (_, index) => product(index)),
    ...Array.from({ length: 10 }, (_, index) => product(400 + index, { featured: true })),
    ...Array.from({ length: 30 }, (_, index) => product(500 + index, { category: "Garden Accessories", categoryAr: null })),
    product(600, { compareAtPriceQar: 900 }),
  ];
  const bootstrap = buildHomeBootstrap({ version: "2026-11-14T20:21:03.609Z", generatedAt: "2026-11-14T20:22:00.000Z", products });

  it("stays small however large the catalogue is, and carries no descriptions", () => {
    expect(bootstrap.productCount).toBe(341);
    expect(bootstrap.products.length).toBeLessThanOrEqual(36);
    expect(JSON.stringify(bootstrap).length).toBeLessThan(25_000);
    expect(JSON.stringify(bootstrap)).not.toContain("A long description");
    expect(isHomeBootstrap(bootstrap)).toBe(true);
  });

  it("holds the featured products, the newest plants (no garden accessories among them) and the offers", () => {
    const ids = bootstrap.products.map((item) => item.id);
    expect(bootstrap.products.filter((item) => item.featured).length).toBeGreaterThanOrEqual(8);
    expect(ids).toContain("p600");
    // The 30 newest products are garden accessories; they must not crowd out the plants.
    expect(bootstrap.products.filter((item) => item.category === "Garden Accessories")).toHaveLength(0);
    expect(ids).toContain("p409");
  });

  it("counts every published product per category", () => {
    expect(bootstrap.categoryCounts).toEqual({ "Indoor Plants": 311, "Garden Accessories": 30 });
    expect(bootstrap.categoryLabelsAr).toEqual({ "Indoor Plants": "نباتات داخلية" });
  });

  it("rejects anything that could not be shown", () => {
    expect(isHomeBootstrap(null)).toBe(false);
    expect(isHomeBootstrap({ ...bootstrap, version: "" })).toBe(false);
    expect(isHomeBootstrap({ ...bootstrap, version: "not a date" })).toBe(false);
    expect(isHomeBootstrap({ ...bootstrap, products: [] })).toBe(false);
    expect(isHomeBootstrap({ ...bootstrap, products: [{ ...bootstrap.products[0], priceQar: "12" }] })).toBe(false);
    expect(isHomeBootstrap(buildHomeBootstrap({ version: "2026-01-01T00:00:00.000Z", generatedAt: "", products: [] }))).toBe(false);
  });
});
