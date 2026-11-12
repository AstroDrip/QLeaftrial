/**
 * Shared types for a product listing and detail.
 *
 * These mirror the Prisma selection set returned by the public API so the
 * client never needs to import Prisma-generated types directly.
 */
export interface ProductMedia {
  url: string;
  altText: string;
  width?: number | null;
  height?: number | null;
  purpose?: "catalog" | "detail" | null;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  nameAr?: string | null;
  category: string;
  categoryAr?: string | null;
  light: string | null;
  lightAr?: string | null;
  priceQar: number;
  /** A genuine earlier price; only present when it is higher than priceQar. */
  compareAtPriceQar?: number | null;
  featured?: boolean;
  scientificName?: string | null;
  careLevel?: "easy" | "moderate" | "demanding" | string | null;
  placement?: "indoor" | "outdoor" | "indoor-outdoor" | string | null;
  createdAt?: string;
  stock: number;
  inStock: boolean;
  image: ProductMedia | null;
  media?: ProductMedia[];
}

export interface ProductDetail extends ProductSummary {
  description: string;
  descriptionAr?: string | null;
  watering?: string | null;
  wateringAr?: string | null;
  media: ProductMedia[];
}

export interface ProductListResponse {
  items: ProductSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ProductListParams {
  q?: string;
  category?: string;
  light?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: "1";
  featured?: "1";
  page?: number;
  sort?: "relevance" | "name-asc" | "price-asc" | "price-desc" | "newest" | "featured";
  lang?: "en" | "ar";
}
