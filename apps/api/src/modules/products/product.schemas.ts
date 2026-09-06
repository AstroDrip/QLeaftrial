import { z } from "zod";

const optionalFilter = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).max(100).optional(),
);

export const productQuerySchema = z.object({
  q: optionalFilter,
  category: optionalFilter,
  light: optionalFilter,
  page: z.coerce.number().int().positive().default(1),
  sort: z.enum(["name-asc", "price-asc", "price-desc"]).default("name-asc"),
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
  light: string;
  lightAr: string | null;
  priceQar: number;
  stock: number;
  inStock: boolean;
  image: ProductMedia | null;
  media: ProductMedia[];
};

export type ProductDetail = ProductSummary & {
  description: string;
  descriptionAr: string | null;
};
