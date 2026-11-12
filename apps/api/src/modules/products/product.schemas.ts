import { z } from "zod";

const optionalFilter = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).max(100).optional(),
);

export const productQuerySchema = z.object({
  q: optionalFilter,
  category: optionalFilter,
  light: optionalFilter,
  lang: z.enum(["en", "ar"]).default("en"),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  inStock: z.enum(["1"]).optional(),
  featured: z.enum(["1"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  sort: z.enum(["name-asc", "price-asc", "price-desc", "newest", "featured"]).default("newest"),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

export type ProductMedia = {
  url: string;
  altText: string;
  width: number | null;
  height: number | null;
  purpose: string | null;
};

export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  category: string;
  categoryAr: string | null;
  light: string | null;
  lightAr: string | null;
  priceQar: number;
  // The genuine earlier price, present only when it is higher than priceQar.
  compareAtPriceQar: number | null;
  featured: boolean;
  scientificName: string | null;
  careLevel: string | null;
  placement: string | null;
  createdAt: string;
  stock: number;
  inStock: boolean;
  image: ProductMedia | null;
  media: ProductMedia[];
};

export type ProductDetail = ProductSummary & {
  description: string;
  descriptionAr: string | null;
  watering: string | null;
  wateringAr: string | null;
};
