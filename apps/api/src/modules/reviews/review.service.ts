import { prisma } from "../../lib/prisma.js";
import type { PrismaClient as SqlitePrismaClient } from "../../../generated/sqlite/index.js";
import { ApiError } from "../../middleware/error-handler.js";
import { removeStoredProductImage, storagePathFromPublicUrl, storeProductImage } from "../admin/product-image-storage.js";
import type {
  AdminReview,
  CreateReviewInput,
  MoveReviewInput,
  PublicReview,
  UpdateReviewInput,
} from "./review.schemas.js";

const db = prisma as unknown as SqlitePrismaClient;

// The carousel is a handful of stories, so the public list is bounded.
const PUBLIC_LIMIT = 12;

const reviewSelection = {
  id: true,
  customerName: true,
  body: true,
  rating: true,
  imageUrl: true,
  productId: true,
  product: { select: { slug: true, name: true, nameAr: true, published: true } },
  reviewedAt: true,
  location: true,
  label: true,
  sortOrder: true,
  published: true,
  createdAt: true,
} as const;

type ReviewRecord = {
  id: string;
  customerName: string;
  body: string;
  rating: number;
  imageUrl: string | null;
  productId: string | null;
  product: { slug: string; name: string; nameAr: string | null; published: boolean } | null;
  reviewedAt: Date | null;
  location: string | null;
  label: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: Date;
};

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const emptyToNull = (value: string | null | undefined) => (value === undefined ? undefined : value?.trim() ? value.trim() : null);
const asDate = (value: string | null | undefined) => (value === undefined ? undefined : value ? new Date(`${value}T00:00:00Z`) : null);

function toPublic(review: ReviewRecord): PublicReview {
  return {
    id: review.id,
    customerName: review.customerName,
    body: review.body,
    rating: review.rating,
    imageUrl: review.imageUrl,
    // A draft or unpublished product is never linked from the storefront.
    product: review.product?.published ? { slug: review.product.slug, name: review.product.name, nameAr: review.product.nameAr } : null,
    reviewedAt: day(review.reviewedAt),
    location: review.location,
    label: review.label,
  };
}

function toAdmin(review: ReviewRecord): AdminReview {
  return {
    id: review.id,
    customerName: review.customerName,
    body: review.body,
    rating: review.rating,
    imageUrl: review.imageUrl,
    productId: review.productId,
    productName: review.product?.name ?? null,
    reviewedAt: day(review.reviewedAt),
    location: review.location,
    label: review.label,
    sortOrder: review.sortOrder,
    published: review.published,
    createdAt: review.createdAt.toISOString(),
  };
}

const ordering = [{ sortOrder: "asc" as const }, { createdAt: "desc" as const }];

export async function listPublishedReviews(): Promise<PublicReview[]> {
  const reviews = (await db.review.findMany({
    where: { published: true },
    select: reviewSelection,
    orderBy: ordering,
    take: PUBLIC_LIMIT,
  })) as ReviewRecord[];
  return reviews.map(toPublic);
}

export async function listAdminReviews(): Promise<AdminReview[]> {
  const reviews = (await db.review.findMany({ select: reviewSelection, orderBy: ordering })) as ReviewRecord[];
  return reviews.map(toAdmin);
}

async function requireProduct(productId: string | null | undefined): Promise<void> {
  if (!productId) return;
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new ApiError(400, "VALIDATION_ERROR", "The selected product does not exist");
}

// Review photos share the product image store (and its size, type and content checks).
async function storeReviewImage(dataUrl: string): Promise<string> {
  return (await storeProductImage(dataUrl, "reviews")).url;
}

async function discardImage(url: string | null): Promise<void> {
  if (!url) return;
  const path = storagePathFromPublicUrl(url);
  if (!path) return;
  try {
    await removeStoredProductImage({ url, storagePath: path });
  } catch {
    // The review is already saved; a leftover file is harmless and must not fail the request.
    console.error(JSON.stringify({ level: "error", event: "review-image-cleanup-failed" }));
  }
}

export async function createReview(input: CreateReviewInput): Promise<AdminReview> {
  await requireProduct(input.productId);
  const imageUrl = input.imageDataUrl ? await storeReviewImage(input.imageDataUrl) : null;
  const last = await db.review.aggregate({ _max: { sortOrder: true } });
  const created = (await db.review.create({
    data: {
      customerName: input.customerName,
      body: input.body,
      rating: input.rating,
      imageUrl,
      productId: input.productId ?? null,
      reviewedAt: asDate(input.reviewedAt) ?? null,
      location: emptyToNull(input.location) ?? null,
      label: emptyToNull(input.label) ?? null,
      published: input.published ?? false,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
    select: reviewSelection,
  })) as ReviewRecord;
  return toAdmin(created);
}

export async function updateReview(id: string, input: UpdateReviewInput): Promise<AdminReview> {
  const existing = await db.review.findUnique({ where: { id }, select: { id: true, imageUrl: true } });
  if (!existing) throw new ApiError(404, "REVIEW_NOT_FOUND", "Review not found");
  await requireProduct(input.productId);

  let imageUrl: string | null | undefined;
  if (input.imageDataUrl) imageUrl = await storeReviewImage(input.imageDataUrl);
  else if (input.removeImage) imageUrl = null;

  const updated = (await db.review.update({
    where: { id },
    data: {
      customerName: input.customerName,
      body: input.body,
      rating: input.rating,
      productId: input.productId,
      reviewedAt: asDate(input.reviewedAt),
      location: emptyToNull(input.location),
      label: emptyToNull(input.label),
      published: input.published,
      imageUrl,
    },
    select: reviewSelection,
  })) as ReviewRecord;

  if (imageUrl !== undefined) await discardImage(existing.imageUrl);
  return toAdmin(updated);
}

export async function deleteReview(id: string): Promise<void> {
  const existing = await db.review.findUnique({ where: { id }, select: { id: true, imageUrl: true } });
  if (!existing) throw new ApiError(404, "REVIEW_NOT_FOUND", "Review not found");
  await db.review.delete({ where: { id } });
  await discardImage(existing.imageUrl);
}

// Swaps a review with its neighbour and renumbers the list 0..n-1, which also repairs any duplicate positions.
export async function moveReview(id: string, { direction }: MoveReviewInput): Promise<AdminReview[]> {
  await db.$transaction(async (transaction) => {
    const rows = await transaction.review.findMany({
      select: { id: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }],
    });
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new ApiError(404, "REVIEW_NOT_FOUND", "Review not found");
    const target = direction === "up" ? index - 1 : index + 1;
    const ids = rows.map((row) => row.id);
    if (target >= 0 && target < ids.length) [ids[index], ids[target]] = [ids[target], ids[index]];
    for (const [position, reviewId] of ids.entries()) {
      await transaction.review.update({ where: { id: reviewId }, data: { sortOrder: position } });
    }
  });
  return listAdminReviews();
}
