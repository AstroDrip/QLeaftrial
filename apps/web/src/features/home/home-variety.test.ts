import { afterEach, describe, expect, it, vi } from "vitest";
import { resetHomeSeedForTests, sessionSeed } from "./home-seed";
import { startPhotos } from "./start-photos";
import type { ProductSummary } from "../catalog/product-types";

describe("the visitor's homepage seed", () => {
  afterEach(() => { resetHomeSeedForTests(); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("stays the same through the browsing session on one day", () => {
    const day = new Date(2026, 10, 18, 9);
    const first = sessionSeed(day);
    resetHomeSeedForTests(); // a new page load in the same tab reads it back from sessionStorage
    expect(sessionSeed(new Date(2026, 10, 18, 22))).toBe(first);
  });

  it("is renewed on a new day", () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementationOnce((array) => { (array as Uint32Array)[0] = 1; return array; })
      .mockImplementationOnce((array) => { (array as Uint32Array)[0] = 2; return array; });
    expect(sessionSeed(new Date(2026, 10, 18))).toBe(1);
    expect(sessionSeed(new Date(2026, 10, 19))).toBe(2);
  });

  it("still works, for the page's lifetime, when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const seed = sessionSeed();
    expect(sessionSeed()).toBe(seed);
  });
});

const media = (url: string) => ({ url, altText: "", width: 640, height: 640, purpose: "catalog" as const, photoKey: url });
const product = (id: string, urls: string[]): ProductSummary => ({ id, slug: id, name: id, category: "Indoor Plants", priceQar: 1, stock: 1, inStock: true, image: media(urls[0]), media: urls.map(media) } as unknown as ProductSummary);

describe("which photograph each card opens on", () => {
  it("never opens two cards on the same picture", () => {
    const items = [product("a", ["/x.webp", "/y.webp"]), product("b", ["/x.webp", "/z.webp"])];
    for (const seed of [1, 2, 3, 4, 5]) {
      const start = startPhotos(items, seed);
      const opening = items.map((item) => item.media![start[item.id]].url);
      expect(new Set(opening).size).toBe(2);
    }
  });

  it("varies with the seed and stays in range", () => {
    const items = Array.from({ length: 12 }, (_, index) => product(`p${index}`, [`/${index}-1.webp`, `/${index}-2.webp`, `/${index}-3.webp`]));
    const starts = [1, 2].map((seed) => startPhotos(items, seed));
    expect(Object.values(starts[0]).every((index) => index >= 0 && index < 3)).toBe(true);
    expect(starts[0]).not.toEqual(starts[1]);
  });
});
