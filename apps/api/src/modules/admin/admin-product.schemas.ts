import { z } from "zod";

const optionalArabicText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum).optional();

const englishText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);

// Care details, merchandising and the admin-only review flag. null clears a value.
const productDetails = {
  compareAtPriceQar: z.number().int().positive().nullable().optional(),
  featured: z.boolean().optional(),
  scientificName: englishText(2, 120).nullable().optional(),
  watering: englishText(2, 200).nullable().optional(),
  wateringAr: z.string().trim().min(2).max(200).nullable().optional(),
  humidity: englishText(2, 200).nullable().optional(),
  humidityAr: z.string().trim().min(2).max(200).nullable().optional(),
  soil: englishText(2, 200).nullable().optional(),
  soilAr: z.string().trim().min(2).max(200).nullable().optional(),
  temperature: englishText(2, 200).nullable().optional(),
  temperatureAr: z.string().trim().min(2).max(200).nullable().optional(),
  careLevel: z.enum(["easy", "moderate", "demanding"]).nullable().optional(),
  // Size and delivery details, mainly for outdoor and large plants. Height is the plant with its pot, in cm.
  heightCm: z.number().int().min(1).max(1000).nullable().optional(),
  sizeNote: englishText(2, 200).nullable().optional(),
  sizeNoteAr: z.string().trim().min(2).max(200).nullable().optional(),
  potIncluded: z.boolean().nullable().optional(),
  handlingNote: englishText(2, 300).nullable().optional(),
  handlingNoteAr: z.string().trim().min(2).max(300).nullable().optional(),
  placement: z.enum(["indoor", "outdoor", "indoor-outdoor"]).nullable().optional(),
  needsReview: z.boolean().optional(),
  reviewNote: z.string().trim().max(500).nullable().optional(),
  // Extra search words (other spellings, local or Arabic names), separated by commas or new lines.
  searchAliases: z.string().trim().max(1000).nullable().optional(),
};

export const updateAdminProductSchema = z
  .object({
    priceQar: z.number().int().nonnegative().optional(),
    costPrice: z.number().int().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
    published: z.boolean().optional(),
    name: englishText(2, 120).optional(),
    description: englishText(10, 2000).optional(),
    category: englishText(2, 80).optional(),
    // null clears light needs for products such as pots and soil.
    light: englishText(2, 80).nullable().optional(),
    nameAr: optionalArabicText(2, 120),
    descriptionAr: optionalArabicText(10, 2000),
    categoryAr: optionalArabicText(2, 80),
    lightAr: optionalArabicText(2, 80),
    ...productDetails,
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), "At least one product field is required");

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

function requireOneImageSource(
  value: { imageDataUrl?: string; stagedImages?: Array<{ purpose: "catalog" | "detail" }> },
  context: z.RefinementCtx,
): void {
  if (Boolean(value.imageDataUrl) === Boolean(value.stagedImages)) {
    context.addIssue({
      code: "custom",
      message: "Provide either a development image or staged image variants",
      path: ["imageDataUrl"],
    });
  }
  if (value.stagedImages) {
    const purposes = new Set(value.stagedImages.map((image) => image.purpose));
    if (!purposes.has("catalog") || !purposes.has("detail")) {
      context.addIssue({
        code: "custom",
        message: "Catalogue and detail image variants are required",
        path: ["stagedImages"],
      });
    }
  }
}

// SHA-256 (hex) of the original photograph, computed in the admin's browser; used to warn about duplicates.
const contentHash = z.string().regex(/^[0-9a-f]{64}$/, "Invalid photo fingerprint").optional();

export const createAdminProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: optionalArabicText(2, 120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase letters, numbers, and hyphens").max(120),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]+$/, "SKU contains invalid characters").max(40),
  description: z.string().trim().min(10).max(2000),
  descriptionAr: optionalArabicText(10, 2000),
  category: z.string().trim().min(2).max(80),
  categoryAr: optionalArabicText(2, 80),
  light: englishText(2, 80).optional(),
  lightAr: optionalArabicText(2, 80),
  priceQar: z.number().int().nonnegative(),
  costPrice: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  imageDataUrl: imageDataUrl.optional(),
  stagedImages: z.array(stagedProductImageSchema).length(2).optional(),
  imageAltText: z.string().trim().min(2).max(200),
  contentHash,
  ...productDetails,
}).strict().superRefine(requireOneImageSource);

export const replaceProductImagesSchema = z.object({
  imageDataUrl: imageDataUrl.optional(),
  stagedImages: z.array(stagedProductImageSchema).length(2).optional(),
  imageAltText: englishText(2, 200),
  contentHash,
}).strict().superRefine(requireOneImageSource);

/** One photograph added to, or replacing one of, a product's photographs. */
export const productPhotoSchema = replaceProductImagesSchema;

export const reorderProductPhotosSchema = z.object({
  keys: z.array(z.string().min(1).max(80)).min(1).max(3),
}).strict();

export const describeProductPhotoSchema = z.object({
  altText: englishText(2, 200),
}).strict();

export type CreateAdminProductInput = z.infer<typeof createAdminProductSchema>;
export type ReplaceProductImagesInput = z.infer<typeof replaceProductImagesSchema>;
export type ProductUploadMetadataInput = z.infer<typeof productUploadMetadataSchema>;
