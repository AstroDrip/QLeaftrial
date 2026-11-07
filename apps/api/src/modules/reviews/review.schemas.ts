import { z } from "zod";

const imageDataUrl = z.string()
  .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/, "Image must be a base64 encoded PNG, JPEG, WebP, or GIF")
  .max(3_000_000, "Image must be smaller than 2 MB");

const optionalLine = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

// A calendar day (YYYY-MM-DD) that is not in the future; the review date is shown, never used for ordering.
const reviewDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-31").refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value) && parsed.getTime() <= Date.now() + 86_400_000;
}, "Use a real date that is not in the future");

const reviewFields = {
  customerName: z.string().trim().min(2, "Enter the customer name").max(80),
  body: z.string().trim().min(10, "The review needs at least 10 characters").max(600, "Keep the review under 600 characters"),
  rating: z.number().int().min(1).max(5),
  productId: z.string().trim().min(1).max(60).nullable().optional(),
  reviewedAt: reviewDate.nullable().optional(),
  location: optionalLine(60),
  label: optionalLine(48),
  published: z.boolean().optional(),
};

export const createReviewSchema = z.object({ ...reviewFields, imageDataUrl: imageDataUrl.optional() }).strict();

export const updateReviewSchema = z
  .object({
    customerName: reviewFields.customerName.optional(),
    body: reviewFields.body.optional(),
    rating: reviewFields.rating.optional(),
    productId: reviewFields.productId,
    reviewedAt: reviewFields.reviewedAt,
    location: reviewFields.location,
    label: reviewFields.label,
    published: reviewFields.published,
    imageDataUrl: imageDataUrl.optional(),
    removeImage: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), "At least one review field is required")
  .refine((value) => !(value.imageDataUrl && value.removeImage), "Choose either a new image or removing the image");

export const moveReviewSchema = z.object({ direction: z.enum(["up", "down"]) }).strict();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type MoveReviewInput = z.infer<typeof moveReviewSchema>;

export type PublicReview = {
  id: string;
  customerName: string;
  body: string;
  rating: number;
  imageUrl: string | null;
  product: { slug: string; name: string; nameAr: string | null } | null;
  reviewedAt: string | null;
  location: string | null;
  label: string | null;
};

export type AdminReview = {
  id: string;
  customerName: string;
  body: string;
  rating: number;
  imageUrl: string | null;
  productId: string | null;
  productName: string | null;
  reviewedAt: string | null;
  location: string | null;
  label: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string;
};
