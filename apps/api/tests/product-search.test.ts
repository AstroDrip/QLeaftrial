import { describe, expect, it } from "vitest";
import {
  buildProductSearchIndex,
  normalizeSearchText,
  searchProductIndex,
  searchProducts,
  type SearchableProduct,
} from "../src/lib/product-search";

// Products shaped like the real catalogue (English and Arabic names, botanical names, categories, aliases).
const catalogue: SearchableProduct[] = [
  { id: "monstera", slug: "monstera-deliciosa", name: "Monstera Deliciosa", nameAr: "مونستيرا ديليسيوسا", scientificName: "Monstera deliciosa", searchAliases: "swiss cheese plant, split leaf philodendron, نبات الجبن السويسري", category: "Indoor Plants", categoryAr: "نباتات داخلية", description: "Large split leaves for a bright room.", descriptionAr: "أوراق كبيرة مشقوقة لغرفة مشرقة." },
  { id: "snake", slug: "snake-plant", name: "Snake Plant", nameAr: "نبات الثعبان", scientificName: "Dracaena trifasciata", searchAliases: "sansevieria, mother in law's tongue, لسان الحماة", category: "Indoor Plants", categoryAr: "نباتات داخلية", description: "Upright leaves that cope with low light.", descriptionAr: "أوراق قائمة تتحمل الإضاءة المنخفضة." },
  { id: "aloe", slug: "aloe-vera", name: "Aloe Vera", nameAr: "ألوفيرا", scientificName: "Aloe vera", searchAliases: "الصبار, صبر", category: "Succulents", categoryAr: "نباتات عصارية", description: "A soothing succulent for a sunny sill.", descriptionAr: "نبات عصاري مهدئ لحافة نافذة مشمسة." },
  { id: "lily", slug: "peace-lily", name: "Peace Lily", nameAr: "زنبقة السلام", scientificName: "Spathiphyllum wallisii", category: "Indoor Plants", categoryAr: "نباتات داخلية", description: "White flowers and glossy leaves.", descriptionAr: "أزهار بيضاء وأوراق لامعة." },
  { id: "areca", slug: "areca-palm", name: "Areca Palm", nameAr: "نخلة الأريكا", scientificName: "Dypsis lutescens", searchAliases: "butterfly palm, نخيل", category: "Indoor Plants", categoryAr: "نباتات داخلية", description: "Feathery fronds for a bright corner.", descriptionAr: "سعف ريشي لزاوية مشرقة." },
  { id: "bougainvillea", slug: "hybrid-bougainvillea-pink", name: "Hybrid Bougainvillea Pink", nameAr: "جهنمية هجينة وردية", category: "Outdoor Plants", categoryAr: "نباتات خارجية", description: "Pink bracts all summer.", descriptionAr: "قنابات وردية طوال الصيف." },
  { id: "pot", slug: "ceramic-pot", name: "Ceramic Pot", nameAr: "أصيص خزفي", category: "Pots", categoryAr: "أصص", description: "A glazed pot for indoor plants.", descriptionAr: "أصيص مزجج للنباتات الداخلية." },
];

const ids = (query: string) => searchProducts(catalogue, query).map((hit) => hit.id);
const top = (query: string) => ids(query)[0];

describe("product search", () => {
  it("1-3. English in lower, upper and mixed case finds the same products in the same order", () => {
    const expected = ids("monstera");
    expect(expected[0]).toBe("monstera");
    expect(ids("Monstera")).toEqual(expected);
    expect(ids("MONSTERA")).toEqual(expected);
    expect(ids("monSteRa")).toEqual(expected);
  });

  it("4. finds products from part of a name (prefix and inside a word)", () => {
    expect(top("mons")).toBe("monstera");
    expect(top("peace")).toBe("lily");
    expect(top("bougain")).toBe("bougainvillea");
    expect(ids("vill")).toContain("bougainvillea");
  });

  it("5. forgives small typing mistakes", () => {
    expect(top("monstra")).toBe("monstera");
    expect(top("monsetra")).toBe("monstera");
    expect(top("bouganvilla")).toBe("bougainvillea");
    expect(top("aloe vira")).toBe("aloe");
  });

  it("6. finds products by their full Arabic name", () => {
    expect(top("نبات الثعبان")).toBe("snake");
    expect(top("زنبقة السلام")).toBe("lily");
    expect(top("جهنمية هجينة وردية")).toBe("bougainvillea");
  });

  it("7. ignores Arabic letter variants (hamza on alef, alef maqsura, taa marbuta, tatweel)", () => {
    expect(top("الوفيرا")).toBe("aloe"); // stored as ألوفيرا
    expect(top("إلوفيرا")).toBe("aloe");
    expect(top("زنبقه السلام")).toBe("lily"); // ه for ة
    expect(top("نخلة الاريكا")).toBe("areca"); // ا for أ
    expect(top("جهـــنمية")).toBe("bougainvillea"); // tatweel
    expect(normalizeSearchText("مُونْسْتِيرَا")).toBe(normalizeSearchText("مونستيرا"));
    expect(normalizeSearchText("هدى")).toBe(normalizeSearchText("هدي"));
  });

  it("8. matches Arabic with and without diacritics, Arabic punctuation and digits", () => {
    expect(top("زَنْبَقَة السَّلَام")).toBe("lily");
    expect(top("نبات، الثعبان؟")).toBe("snake");
    expect(normalizeSearchText("١٢٣")).toBe("123");
  });

  it("9. Arabic then English in one query", () => {
    expect(top("نبات snake")).toBe("snake");
    expect(top("زنبقة peace")).toBe("lily");
  });

  it("10. English then Arabic in one query, even without a space between them", () => {
    expect(top("monstera مونستيرا")).toBe("monstera");
    expect(top("aloe ألوفيرا")).toBe("aloe");
    expect(top("aloeألوفيرا")).toBe("aloe");
  });

  it("11. finds products by their botanical name", () => {
    expect(top("Dracaena trifasciata")).toBe("snake");
    expect(top("spathiphyllum")).toBe("lily");
    expect(top("dypsis")).toBe("areca");
  });

  it("12. finds products by aliases set in admin, in English and Arabic", () => {
    expect(top("sansevieria")).toBe("snake");
    expect(top("swiss cheese plant")).toBe("monstera");
    expect(top("لسان الحماة")).toBe("snake");
    expect(top("صبار")).toBe("aloe"); // alias "الصبار", typed without the article
    expect(top("butterfly palm")).toBe("areca");
  });

  it("13. empty or blank input returns nothing", () => {
    expect(ids("")).toEqual([]);
    expect(ids("   ")).toEqual([]);
    expect(ids("،؟ - !")).toEqual([]);
  });

  it("14. a query matching nothing returns nothing, and one stray letter does not match everything", () => {
    expect(ids("xylophone")).toEqual([]);
    expect(ids("قطار")).toEqual([]);
    expect(ids("z")).toEqual([]);
  });

  it("ranks name matches above description or category matches", () => {
    // "pot" is the pot's name; the plants only mention pots nowhere, and "indoor plants" is a category.
    expect(top("pot")).toBe("pot");
    const palm = ids("palm");
    expect(palm[0]).toBe("areca");
    // Every word must match when some product has them all.
    expect(ids("snake plant")[0]).toBe("snake");
  });

  it("15. stays fast on a large catalogue (5,000 products)", () => {
    const large: SearchableProduct[] = Array.from({ length: 5000 }, (_, index) => {
      const base = catalogue[index % catalogue.length];
      return { ...base, id: `${base.id}-${index}`, name: `${base.name} ${index}`, slug: `${base.slug}-${index}` };
    });
    const started = performance.now();
    const index = buildProductSearchIndex(large);
    const built = performance.now() - started;
    const queries = ["monstera", "نبات الثعبان", "bouganvilla", "aloe ألوفيرا", "sansevieria", "pea"];
    const searchStarted = performance.now();
    for (const query of queries) expect(searchProductIndex(index, query).length).toBeGreaterThan(0);
    const perQuery = (performance.now() - searchStarted) / queries.length;
    expect(built).toBeLessThan(2000);
    expect(perQuery).toBeLessThan(150);
  });
});
