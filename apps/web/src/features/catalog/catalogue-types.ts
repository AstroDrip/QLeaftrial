/**
 * Public catalogue snapshot types. These mirror the public product shape the
 * backend publishes (supplier cost and admin-only fields are excluded).
 */
export interface CatalogueMedia {
  url: string;
  altText: string;
  width: number | null;
  height: number | null;
  purpose: string | null;
  sortOrder: number;
}

export interface CatalogueProduct {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  description: string;
  descriptionAr: string | null;
  category: string;
  categoryAr: string | null;
  light: string | null;
  lightAr: string | null;
  priceQar: number;
  stock: number;
  inStock: boolean;
  /** ISO date; used to order "newest" the same way the API does. Absent in older snapshots. */
  createdAt?: string;
  compareAtPriceQar?: number | null;
  featured?: boolean;
  scientificName?: string | null;
  careLevel?: string | null;
  placement?: string | null;
  image: CatalogueMedia | null;
  media: CatalogueMedia[];
}

export interface CatalogueSnapshot {
  version: string;
  generatedAt: string;
  productCount: number;
  products: CatalogueProduct[];
}
