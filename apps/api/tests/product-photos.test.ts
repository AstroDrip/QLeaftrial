import { describe, expect, it } from "vitest";
import { catalogueSizePhotos, distinctPhotos, groupPhotos } from "../src/lib/product-photos";
import { buildHomeBootstrap } from "../src/lib/home-bootstrap";

const pair = (name: string) => [
  { url: `/media/${name}-640.webp`, purpose: "catalog" },
  { url: `/media/${name}-1200.webp`, purpose: "detail" },
];

describe("product photographs", () => {
  it("groups each catalogue file with the detail file after it", () => {
    expect(groupPhotos([...pair("a"), ...pair("b"), { url: "/media/c.jpg", purpose: null }]).map((photo) => photo.map((item) => item.url)))
      .toEqual([["/media/a-640.webp", "/media/a-1200.webp"], ["/media/b-640.webp", "/media/b-1200.webp"], ["/media/c.jpg"]]);
  });

  it("never shows the same picture twice, and stops at three", () => {
    const media = [...pair("a"), ...pair("a"), ...pair("b"), ...pair("c"), ...pair("d")];
    expect(distinctPhotos(media).map((photo) => photo[0].url)).toEqual(["/media/a-640.webp", "/media/b-640.webp", "/media/c-640.webp"]);
    expect(distinctPhotos(media, 2)).toHaveLength(2);
  });

  it("gives a card the catalogue size of each photograph", () => {
    expect(catalogueSizePhotos([...pair("a"), ...pair("b")]).map((item) => item.url)).toEqual(["/media/a-640.webp", "/media/b-640.webp"]);
    expect(catalogueSizePhotos([{ url: "/only.jpg", purpose: null }]).map((item) => item.url)).toEqual(["/only.jpg"]);
    expect(catalogueSizePhotos([])).toEqual([]);
  });

  it("puts up to three distinct card-size photographs in the homepage data", () => {
    const image = { url: "/media/a-640.webp", altText: "A", width: 640, height: 640, purpose: "catalog", sortOrder: 0 };
    const media = [...pair("a"), ...pair("b"), ...pair("b"), ...pair("c"), ...pair("d")].map((item, sortOrder) => ({ ...item, altText: "A", width: 640, height: 640, sortOrder }));
    const bootstrap = buildHomeBootstrap({
      version: "2026-11-17T00:00:00.000Z", generatedAt: "2026-11-17T00:00:00.000Z",
      products: [{ id: "p", slug: "p", name: "P", nameAr: null, category: "Indoor Plants", categoryAr: null, light: null, lightAr: null, priceQar: 10, stock: 1, inStock: true, featured: true, image, media }],
    });
    expect(bootstrap.products[0].media.map((item) => item.url)).toEqual(["/media/a-640.webp", "/media/b-640.webp", "/media/c-640.webp"]);
  });
});
