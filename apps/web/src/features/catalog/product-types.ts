/**
 * Shared types for a product listing and detail.
 *
 * These mirror the Prisma selection set returned by the public API so the
 * client never needs to import Prisma-generated types directly.
 */
export interface ProductMedia {
  url: string;
  altText: string;
}

export interface ArAsset {
  glbUrl: string;
  usdzUrl: string | null;
  attribution: string;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  category: string;
  light: string;
  priceQar: number;
  inStock: boolean;
  image: ProductMedia | null;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  media: ProductMedia[];
  arAsset: ArAsset | null;
}

export interface ProductListResponse {
  items: ProductSummary[];
  page: number;
  pageSize: number;
}

export interface ProductListParams {
  q?: string;
  category?: string;
  light?: string;
  page?: number;
}
