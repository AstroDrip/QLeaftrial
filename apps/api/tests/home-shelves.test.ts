import { describe, expect, it } from "vitest";
import { pickShelves, seededShuffle, shelfPools, type ShelfProduct } from "../src/lib/home-shelves";

type P = ShelfProduct & { slug: string };
const plant = (index: number, extra: Partial<P> = {}): P => ({ id: `p${index}`, slug: `plant-${index}`, category: "Indoor Plants", priceQar: 100, inStock: true, ...extra });

// Newest first, as the homepage and the bootstrap pass them.
const newestFirst: P[] = [
  ...Array.from({ length: 6 }, (_, index) => plant(index, { category: "Garden Accessories" })),
  ...Array.from({ length: 40 }, (_, index) => plant(100 + index, {
    featured: index % 3 === 0,
    compareAtPriceQar: index % 5 === 0 ? 150 : null,
    careLevel: index % 2 === 0 ? "easy" : "moderate",
    light: index % 2 === 1 ? "Low to bright indirect" : "Bright indirect",
  })),
];
const pools = shelfPools(newestFirst);
const ids = (shelves: Record<string, P[]>) => Object.values(shelves).flat().map((item) => item.id);

describe("homepage shelves", () => {
  it("never shows a product twice, keeps garden accessories out of New Arrivals and fills each shelf", () => {
    for (const seed of [1, 2, 3, 99, 123456789]) {
      const shelves = pickShelves(pools, seed);
      expect(new Set(ids(shelves)).size).toBe(ids(shelves).length);
      expect(shelves.new.some((item) => item.category === "Garden Accessories")).toBe(false);
      expect(shelves.new).toHaveLength(8);
      expect(shelves.featured).toHaveLength(8);
      expect(shelves.easy).toHaveLength(4);
      expect(shelves.lowLight).toHaveLength(4);
      expect(shelves.featured.every((item) => item.featured)).toBe(true);
      expect(shelves.offers.every((item) => item.compareAtPriceQar! > item.priceQar)).toBe(true);
    }
  });

  it("is stable for one seed and varies between seeds", () => {
    expect(ids(pickShelves(pools, 42))).toEqual(ids(pickShelves(pools, 42)));
    const picks = new Set([1, 2, 3, 4, 5, 6].map((seed) => ids(pickShelves(pools, seed)).join()));
    expect(picks.size).toBeGreaterThan(3);
  });

  it("keeps New Arrivals newest first and draws them only from the 16 newest plants", () => {
    const newestPlants = newestFirst.filter((item) => item.category !== "Garden Accessories").slice(0, 16).map((item) => item.id);
    for (const seed of [7, 8, 9]) {
      const shown = pickShelves(pools, seed).new.map((item) => item.id);
      expect(shown.every((id) => newestPlants.includes(id))).toBe(true);
      expect(shown).toEqual(newestPlants.filter((id) => shown.includes(id)));
    }
  });

  it("drops offers when ordering is off, and leaves the featured choice to the shop", () => {
    expect(pickShelves(pools, 5, { offers: false }).offers).toEqual([]);
    const onlyTwoFeatured = shelfPools(newestFirst.map((item, index) => ({ ...item, featured: index === 10 || index === 20 })));
    expect(pickShelves(onlyTwoFeatured, 5).featured.map((item) => item.id).sort()).toEqual(["p104", "p114"]);
  });

  it("shuffles without losing or inventing items", () => {
    const items = Array.from({ length: 20 }, (_, index) => index);
    expect([...seededShuffle(items, 3)].sort((a, b) => a - b)).toEqual(items);
  });
});
