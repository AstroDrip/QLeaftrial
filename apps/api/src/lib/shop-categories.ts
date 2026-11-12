// The shop's categories: their order, their names in English and Arabic, older names that mean the same category,
// and the photograph on their tile. This is the one place to change any of these; the API and the storefront both
// read it (apps/web/src/features/catalog/shop-categories.ts re-exports this file). Pure TypeScript, no imports.
//
// `key` is the value stored on products and used in shop links (?category=...). It is kept as it is, so existing
// products, links and bookmarks keep working; only the name customers see comes from `en` / `ar`.

export type ShopCategoryDefinition = {
  key: string;
  en: string;
  ar: string;
  /** Older names of this category (matched ignoring case and spacing, like the key and display names). */
  aliases: string[];
  image: string;
};

export const SHOP_CATEGORIES: readonly ShopCategoryDefinition[] = [
  { key: "Indoor Plants", en: "Indoor Plants", ar: "نباتات داخلية", aliases: [], image: "/media/categories/indoor-plants" },
  { key: "Table Top Plants", en: "Tabletop Plants", ar: "نباتات مكتبية", aliases: ["Table Tops", "Table Top"], image: "/media/categories/tabletop-plants" },
  { key: "Gift Plants", en: "Gift Plants", ar: "نباتات للإهداء", aliases: ["Gift a Plant"], image: "/media/categories/gift-plants" },
  { key: "Outdoor Plants", en: "Outdoor Plants", ar: "نباتات خارجية", aliases: [], image: "/media/categories/outdoor-plants" },
  { key: "Pots", en: "Pots", ar: "أصص", aliases: ["Pots & Planters"], image: "/media/categories/pots" },
  { key: "Garden Accessories", en: "Garden Accessories", ar: "مستلزمات الحديقة", aliases: [], image: "/media/categories/garden-accessories" },
];

const fold = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const byName = new Map<string, ShopCategoryDefinition>();
for (const category of SHOP_CATEGORIES) {
  for (const name of [category.key, category.en, category.ar, ...category.aliases]) byName.set(fold(name), category);
}

export function findShopCategory(value: string | null | undefined): ShopCategoryDefinition | undefined {
  return value ? byName.get(fold(value)) : undefined;
}

/** The stored category a name or older spelling refers to ("Tabletop Plants" -> "Table Top Plants"). */
export function canonicalCategory(value: string): string {
  return findShopCategory(value)?.key ?? value.trim();
}

/** Position in the shop's order; categories not listed above come after, alphabetically. */
export function compareCategories(a: string, b: string): number {
  const rank = (value: string) => {
    const found = findShopCategory(value);
    return found ? SHOP_CATEGORIES.indexOf(found) : SHOP_CATEGORIES.length;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}

/** The name customers see. Unlisted categories fall back to the product's own Arabic name, then the stored value. */
export function categoryName(value: string, language: "en" | "ar", storedArabic?: string | null): string {
  const found = findShopCategory(value);
  if (language === "ar") return found?.ar ?? (storedArabic?.trim() || value);
  return found?.en ?? value;
}

/**
 * Every listed category in order (with a count of 0 when it has no products yet), followed by any other category
 * passed in. Counts are keyed by stored category.
 */
export function orderedCategoryCounts(counts: Record<string, number>): Array<{ category: string; count: number }> {
  const merged = new Map<string, number>();
  for (const [category, count] of Object.entries(counts)) {
    const key = canonicalCategory(category);
    merged.set(key, (merged.get(key) ?? 0) + count);
  }
  for (const category of SHOP_CATEGORIES) if (!merged.has(category.key)) merged.set(category.key, 0);
  return [...merged.entries()]
    .sort(([a], [b]) => compareCategories(a, b))
    .map(([category, count]) => ({ category, count }));
}
