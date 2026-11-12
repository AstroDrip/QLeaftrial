import type { SiteLanguage } from "../../content/locales";
import type { CatalogueMedia, CatalogueProduct } from "./catalogue-types";
import type { ProductListParams, ProductListResponse, ProductMedia, ProductSummary } from "./product-types";
import { searchProducts } from "./search";
import { canonicalCategory } from "./shop-categories";

// Answers a product-list query from the saved catalogue the same way the API would (same filters, search
// fields, sort orders and page size), so switching from saved to live data never reshuffles the page.

export const PAGE_SIZE = 24;

function mediaToSummary(medium: CatalogueMedia | null): ProductMedia | null {
  if (!medium) return null;
  return {
    url: medium.url,
    altText: medium.altText,
    width: medium.width,
    height: medium.height,
    purpose: medium.purpose === "catalog" || medium.purpose === "detail" ? medium.purpose : undefined,
  };
}

export function catalogueProductToSummary(product: CatalogueProduct, language: SiteLanguage): ProductSummary {
  const arabic = language === "ar";
  return {
    id: product.id,
    slug: product.slug,
    name: arabic && product.nameAr?.trim() ? product.nameAr : product.name,
    nameAr: product.nameAr,
    category: arabic && product.categoryAr?.trim() ? product.categoryAr : product.category,
    categoryAr: product.categoryAr,
    light: arabic && product.lightAr?.trim() ? product.lightAr : product.light,
    lightAr: product.lightAr,
    priceQar: product.priceQar,
    compareAtPriceQar: product.compareAtPriceQar ?? null,
    featured: product.featured ?? false,
    scientificName: product.scientificName ?? null,
    careLevel: product.careLevel ?? null,
    placement: product.placement ?? null,
    createdAt: product.createdAt,
    stock: product.stock,
    inStock: product.inStock,
    image: mediaToSummary(product.image),
    media: product.media.map(mediaToSummary).filter((value): value is ProductMedia => Boolean(value)),
  };
}

// With a search, products in best-match order (the API's ranking); without one, all of them.
function searchCatalogue(products: CatalogueProduct[], query: string | undefined): CatalogueProduct[] {
  if (!query?.trim()) return products;
  const byId = new Map(products.map((product) => [product.id, product]));
  return searchProducts(products, query).flatMap((hit) => byId.get(hit.id) ?? []);
}

export function filterCatalogue(products: CatalogueProduct[], params: ProductListParams): CatalogueProduct[] {
  return searchCatalogue(products, params.q).filter((product) => {
    if (params.category && product.category !== canonicalCategory(params.category)) return false;
    if (params.light && product.light !== params.light) return false;
    if (params.inStock && !product.inStock) return false;
    if (params.featured && !product.featured) return false;
    if (params.minPrice !== undefined && product.priceQar < params.minPrice) return false;
    if (params.maxPrice !== undefined && product.priceQar > params.maxPrice) return false;
    return true;
  });
}

export function sortCatalogue(products: CatalogueProduct[], sort: ProductListParams["sort"]): CatalogueProduct[] {
  // Best match: filterCatalogue already returns search results in ranked order.
  if (sort === "relevance") return products;
  return [...products].sort((a, b) => {
    if (sort === "price-asc") return a.priceQar - b.priceQar || a.slug.localeCompare(b.slug);
    if (sort === "price-desc") return b.priceQar - a.priceQar || a.slug.localeCompare(b.slug);
    if (sort === "newest") return (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.slug.localeCompare(b.slug);
    if (sort === "featured") return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.slug.localeCompare(b.slug);
    return a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug);
  });
}

export function catalogueListResponse(products: CatalogueProduct[], params: ProductListParams): ProductListResponse {
  const sort = params.sort ?? (params.q?.trim() ? "relevance" : "newest");
  const sorted = sortCatalogue(filterCatalogue(products, params), sort);
  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const page = Math.min(Math.max(params.page ?? 1, 1), totalPages);
  return {
    items: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((product) => catalogueProductToSummary(product, params.lang ?? "en")),
    page,
    pageSize: PAGE_SIZE,
    totalItems,
    totalPages,
  };
}
