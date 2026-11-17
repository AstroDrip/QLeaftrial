import { describe, expect, it } from "vitest";
import type { CatalogueProduct } from "./catalogue-types";
import { catalogueListResponse } from "./catalogue-view";
import { sizeFacts } from "./size-facts";

function product(overrides: Partial<CatalogueProduct> & Pick<CatalogueProduct, "id" | "slug" | "name">): CatalogueProduct {
  return {
    nameAr: null, description: "A plant.", descriptionAr: null, category: "Outdoor Plants", categoryAr: null, light: null, lightAr: null,
    priceQar: 99, stock: 10, inStock: true, createdAt: "2026-11-01T00:00:00.000Z", image: null, media: [],
    ...overrides,
  } as CatalogueProduct;
}

const products = [
  product({ id: "1", slug: "fern", name: "Fern", heightCm: 30, placement: "indoor" }),
  product({ id: "2", slug: "ficus", name: "Ficus", heightCm: 80, placement: "indoor-outdoor", sizeNote: "Medium tree", sizeNoteAr: "شجرة متوسطة" }),
  product({ id: "3", slug: "palm", name: "Palm", heightCm: 120, placement: "outdoor" }),
  product({ id: "4", slug: "pot", name: "Pot", heightCm: null, placement: null }),
];
const slugs = (params: Parameters<typeof catalogueListResponse>[1]) => catalogueListResponse(products, { ...params, sort: "name-asc" }).items.map((item) => item.slug);

describe("size and place filters on the saved catalogue (same rules as the API)", () => {
  it("groups by height: under 50 cm, 50 to 119 cm, 120 cm and taller; no height means no group", () => {
    expect(slugs({ size: "small" })).toEqual(["fern"]);
    expect(slugs({ size: "medium" })).toEqual(["ficus"]);
    expect(slugs({ size: "large" })).toEqual(["palm"]);
  });

  it("finds a plant for indoors or outdoors under both choices", () => {
    expect(slugs({ placement: "indoor" })).toEqual(["fern", "ficus"]);
    expect(slugs({ placement: "outdoor" })).toEqual(["ficus", "palm"]);
    expect(slugs({ placement: "outdoor", size: "large" })).toEqual(["palm"]);
  });

  it("gives cards the height and the size note in the customer's language", () => {
    const [arabic] = catalogueListResponse(products, { q: "ficus", lang: "ar" }).items;
    expect(arabic).toMatchObject({ heightCm: 80, sizeNote: "شجرة متوسطة" });
  });
});

describe("size facts on the product page", () => {
  it("lists only what was entered", () => {
    expect(sizeFacts({ heightCm: 150, sizeNote: "Tall floor plant", potIncluded: false, handlingNote: null }, false)).toEqual([
      { key: "height", label: "Height", value: "About 150 cm with the pot" },
      { key: "size", label: "Size", value: "Tall floor plant" },
      { key: "pot", label: "Pot", value: "Not included" },
    ]);
    expect(sizeFacts({ heightCm: null, sizeNote: " ", potIncluded: null, handlingNote: null }, false)).toEqual([]);
  });

  it("speaks Arabic on the Arabic page", () => {
    expect(sizeFacts({ heightCm: 90, sizeNote: null, potIncluded: true, handlingNote: "يُوصَل واقفًا" }, true).map((fact) => `${fact.label}: ${fact.value}`)).toEqual([
      "الارتفاع: نحو 90 سم مع الأصيص", "الأصيص: مشمول", "التوصيل والتعامل: يُوصَل واقفًا",
    ]);
  });
});
