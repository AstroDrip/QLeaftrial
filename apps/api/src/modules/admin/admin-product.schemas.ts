import { z } from "zod";

const optionalArabicText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum).optional();

export const updateAdminProductSchema = z
  .object({
    priceQar: z.number().int().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
    nameAr: optionalArabicText(2, 120),
    descriptionAr: optionalArabicText(10, 2000),
    categoryAr: optionalArabicText(2, 80),
    lightAr: optionalArabicText(2, 80),
  })
  .strict()
  .refine(
    (value) =>
      value.priceQar !== undefined ||
      value.stock !== undefined ||
      value.nameAr !== undefined ||
      value.descriptionAr !== undefined ||
      value.categoryAr !== undefined ||
      value.lightAr !== undefined,
    "At least one product field is required",
  );

export type UpdateAdminProductInput = z.infer<typeof updateAdminProductSchema>;

const imageDataUrl = z.string()
  .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/, "Image must be a base64 encoded PNG, JPEG, WebP, or GIF")
  .max(3_000_000, "Image must be smaller than 2 MB");

export const createAdminProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: optionalArabicText(2, 120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase letters, numbers, and hyphens").max(120),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]+$/, "SKU contains invalid characters").max(40),
  description: z.string().trim().min(10).max(2000),
  descriptionAr: optionalArabicText(10, 2000),
  category: z.string().trim().min(2).max(80),
  categoryAr: optionalArabicText(2, 80),
  light: z.string().trim().min(2).max(80),
  lightAr: optionalArabicText(2, 80),
  priceQar: z.number().int().nonnegative(),
  costPrice: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  imageDataUrl,
  imageAltText: z.string().trim().min(2).max(200),
});

export type CreateAdminProductInput = z.infer<typeof createAdminProductSchema>;
