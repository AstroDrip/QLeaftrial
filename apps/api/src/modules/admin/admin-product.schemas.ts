import { z } from "zod";

export const updateAdminProductSchema = z
  .object({
    priceQar: z.number().int().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (value) => value.priceQar !== undefined || value.stock !== undefined,
    "At least one product field is required",
  );

export type UpdateAdminProductInput = z.infer<typeof updateAdminProductSchema>;

const imageDataUrl = z.string()
  .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/, "Image must be a base64 encoded PNG, JPEG, WebP, or GIF")
  .max(3_000_000, "Image must be smaller than 2 MB");

export const productUploadMetadataSchema = z.object({
  purpose: z.enum(["catalog", "detail"]),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  byteSize: z.number().int().positive().max(2 * 1024 * 1024),
  width: z.number().int().positive().max(8_000),
  height: z.number().int().positive().max(8_000),
}).strict();

const stagedProductImageSchema = productUploadMetadataSchema.extend({
  stagingPath: z.string().min(1).max(300),
});

export const createAdminProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase letters, numbers, and hyphens").max(120),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]+$/, "SKU contains invalid characters").max(40),
  description: z.string().trim().min(10).max(2000),
  category: z.string().trim().min(2).max(80),
  light: z.string().trim().min(2).max(80),
  priceQar: z.number().int().nonnegative(),
  costPrice: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  imageDataUrl: imageDataUrl.optional(),
  stagedImages: z.array(stagedProductImageSchema).length(2).optional(),
  imageAltText: z.string().trim().min(2).max(200),
}).strict().superRefine((value, context) => {
  if (Boolean(value.imageDataUrl) === Boolean(value.stagedImages)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either a development image or staged image variants",
      path: ["imageDataUrl"],
    });
  }
  if (value.stagedImages) {
    const purposes = new Set(value.stagedImages.map((image) => image.purpose));
    if (!purposes.has("catalog") || !purposes.has("detail")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Catalogue and detail image variants are required",
        path: ["stagedImages"],
      });
    }
  }
});

export type CreateAdminProductInput = z.infer<typeof createAdminProductSchema>;
export type ProductUploadMetadataInput = z.infer<typeof productUploadMetadataSchema>;
