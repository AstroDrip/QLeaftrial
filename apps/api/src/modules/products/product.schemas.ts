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
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

export type ProductMedia = {
  url: string;
  altText: string;
};

export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  category: string;
  light: string;
  priceQar: number;
  stock: number;
  inStock: boolean;
  image: ProductMedia | null;
};

export type ProductDetail = ProductSummary & {
  description: string;
  media: ProductMedia[];
};
