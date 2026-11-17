import { canonicalCategory } from "./shop-categories.js";
import { catalogueSizePhotos } from "./product-photos.js";

// The homepage bootstrap: a small, customer-safe cut of the public catalogue that ships inside the storefront's
// own HTML, so a first-time visitor sees categories and products without waiting for any request. It is built by
// the same pure function at build time (from the database) and for the committed fallback (from the public
// catalogue), and read by the homepage in the browser. Display only: checkout always re-reads prices and stock.
export type BootstrapMedia = { url: string; altText: string; width: number | null; height: number | null; purpose: string | null; sortOrder: number };

export type BootstrapSourceProduct = {
  id: string; slug: string; name: string; nameAr: string | null; category: string; categoryAr: string | null;
  light: string | null; lightAr: string | null; priceQar: number; compareAtPriceQar?: number | null;
  featured?: boolean; careLevel?: string | null; stock: number; inStock: boolean; createdAt?: string;
  image: BootstrapMedia | null;
  /** All of the product's media rows; the bootstrap keeps only the card size of up to three distinct photographs. */
  media?: BootstrapMedia[];
};

export type BootstrapProduct = BootstrapSourceProduct & { description: ""; descriptionAr: null; media: BootstrapMedia[] };

export type HomeBootstrap = {
  /** Same version string as the catalogue it was cut from; a newer catalogue always replaces it. */
  version: string;
  generatedAt: string;
  /** Number of published products in the whole catalogue (the list below is only the homepage's share). */
  productCount: number;
  /** Published products per category, for the category rail. */
  categoryCounts: Record<string, number>;
  categoryLabelsAr: Record<string, string>;
  products: BootstrapProduct[];
};

const FEATURED = 8;
const NEWEST = 12;
const OFFERS = 8;
const DISCOVERY = 4;
const NOT_NEW_ARRIVALS = new Set(["Garden Accessories"]);
const LOW_LIGHT = "Low to bright indirect";

export function buildHomeBootstrap(catalogue: { version: string; generatedAt: string; products: BootstrapSourceProduct[] }): HomeBootstrap {
  const newestFirst = [...catalogue.products].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.name.localeCompare(b.name));
  const chosen = new Map<string, BootstrapSourceProduct>();
  const add = (products: BootstrapSourceProduct[], limit: number) => {
    let added = 0;
    for (const product of products) {
      if (added >= limit) break;
      if (!chosen.has(product.id)) { chosen.set(product.id, product); added += 1; }
    }
  };
  // The same shelves the homepage builds, each with a little spare so a product claimed by an earlier shelf
  // still leaves the next one full.
  add(newestFirst.filter((product) => product.featured), FEATURED);
  add(newestFirst.filter((product) => !NOT_NEW_ARRIVALS.has(canonicalCategory(product.category))), NEWEST);
  add(newestFirst.filter((product) => product.compareAtPriceQar != null && product.compareAtPriceQar > product.priceQar), OFFERS);
  add(newestFirst.filter((product) => product.careLevel === "easy" && product.inStock), DISCOVERY);
  add(newestFirst.filter((product) => product.light === LOW_LIGHT && product.inStock), DISCOVERY);

  const categoryCounts: Record<string, number> = {};
  const categoryLabelsAr: Record<string, string> = {};
  for (const product of catalogue.products) {
    categoryCounts[product.category] = (categoryCounts[product.category] ?? 0) + 1;
    if (product.categoryAr?.trim() && !categoryLabelsAr[product.category]) categoryLabelsAr[product.category] = product.categoryAr;
  }

  return {
    version: catalogue.version,
    generatedAt: catalogue.generatedAt,
    productCount: catalogue.products.length,
    categoryCounts,
    categoryLabelsAr,
    products: [...chosen.values()].map((product) => ({
      id: product.id, slug: product.slug, name: product.name, nameAr: product.nameAr,
      category: product.category, categoryAr: product.categoryAr, light: product.light, lightAr: product.lightAr,
      priceQar: product.priceQar, compareAtPriceQar: product.compareAtPriceQar ?? null,
      featured: Boolean(product.featured), careLevel: product.careLevel ?? null,
      stock: product.stock, inStock: product.inStock, createdAt: product.createdAt,
      image: product.image,
      // Cards change photographs before the API answers too: the card-size file of each distinct photograph.
      description: "", descriptionAr: null, media: catalogueSizePhotos(product.media?.length ? product.media : product.image ? [product.image] : []),
    })),
  };
}

/** True for a bootstrap that can be shown: a version, at least one product, and the fields a card needs. */
export function isHomeBootstrap(value: unknown): value is HomeBootstrap {
  if (!value || typeof value !== "object") return false;
  const bootstrap = value as Partial<HomeBootstrap>;
  return typeof bootstrap.version === "string" && Boolean(bootstrap.version) && !Number.isNaN(Date.parse(bootstrap.version)) &&
    Boolean(bootstrap.categoryCounts) && typeof bootstrap.categoryCounts === "object" &&
    Array.isArray(bootstrap.products) && bootstrap.products.length > 0 &&
    bootstrap.products.every((product) => Boolean(product) && typeof product.id === "string" && Boolean(product.id) &&
      typeof product.slug === "string" && Boolean(product.slug) && typeof product.name === "string" && Boolean(product.name) &&
      typeof product.priceQar === "number" && Number.isFinite(product.priceQar) && typeof product.category === "string");
}
