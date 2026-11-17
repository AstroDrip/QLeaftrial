import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import { MAX_PRODUCT_PHOTOS, groupPhotos } from "../../lib/product-photos.js";
import { removeStoredProductImage, storagePathFromPublicUrl, storeProductImage } from "./product-image-storage.js";
import { finalizeProductImages, removeProductImagePaths, type FinalProductImage, type StagedProductImage } from "./product-upload.service.js";

// A product's photographs in admin: up to three, each saved as a catalogue-size and a detail-size file that share a
// photoKey. Every change (add, replace, remove, reorder, describe) is one database transaction that rewrites the
// product's sort order as photo 1 (catalogue, detail), photo 2 (catalogue, detail), photo 3, so the first photograph is
// always the main one. Image files are copied into place before the transaction and removed if it fails; files a
// change made unused are deleted only after it has committed. Nothing here moves image bytes through the API: the
// browser uploads both sizes straight to storage with signed links (finalizeProductImages checks and moves them).
const db = prisma as any;

export type MediaRecord = {
  id: string; url: string; altText: string; width: number | null; height: number | null;
  purpose: string | null; sortOrder: number; photoKey: string | null; contentHash: string | null;
};

export type AdminPhoto = {
  /** Stable for this photograph: its photoKey, or for an older photograph without one, an id derived from its first file. */
  key: string;
  url: string;
  detailUrl: string | null;
  altText: string;
  width: number | null;
  height: number | null;
  contentHash: string | null;
};

export const MEDIA_SELECTION = {
  id: true, url: true, altText: true, width: true, height: true, purpose: true, sortOrder: true, photoKey: true, contentHash: true,
} as const;

const keyOf = (photo: MediaRecord[]) => photo[0].photoKey ?? `file-${photo[0].id}`;

export function photosFromMedia(media: MediaRecord[]): AdminPhoto[] {
  return groupPhotos([...media].sort((a, b) => a.sortOrder - b.sortOrder)).map((photo) => {
    const catalog = photo.find((item) => item.purpose === "catalog") ?? photo[0];
    const detail = photo.find((item) => item.purpose === "detail") ?? null;
    return { key: keyOf(photo), url: catalog.url, detailUrl: detail?.url ?? null, altText: catalog.altText, width: catalog.width, height: catalog.height, contentHash: catalog.contentHash ?? detail?.contentHash ?? null };
  });
}

export type PhotoUpload = { stagedImages?: StagedProductImage[]; imageDataUrl?: string; imageAltText: string; contentHash?: string };

/** New file rows for one photograph (not yet saved), with a fresh photoKey. */
type NewRow = { url: string; altText: string; width?: number; height?: number; purpose?: string; photoKey: string; contentHash?: string };

function rowsFor(finalized: FinalProductImage[], legacyUrl: string | undefined, upload: PhotoUpload): NewRow[] {
  const photoKey = randomUUID();
  const common = { altText: upload.imageAltText, photoKey, ...(upload.contentHash ? { contentHash: upload.contentHash } : {}) };
  if (!finalized.length) return [{ url: legacyUrl!, ...common }];
  return [...finalized]
    .sort((left, right) => (left.purpose === "catalog" ? -1 : right.purpose === "catalog" ? 1 : 0))
    .map((image) => ({ url: image.url, width: image.width, height: image.height, purpose: image.purpose, ...common }));
}

/** Puts the uploaded files in place (or stores the development data URL). Undone by `discard` if the change fails. */
async function prepareUpload(upload: PhotoUpload, slug: string) {
  if (process.env.QLEAVES_DATABASE_PROVIDER === "postgresql" && upload.imageDataUrl) {
    throw new ApiError(400, "VALIDATION_ERROR", "Production photos must be uploaded as staged image sizes");
  }
  const finalized = upload.stagedImages ? await finalizeProductImages(upload.stagedImages, slug) : [];
  const legacy = upload.imageDataUrl ? await storeProductImage(upload.imageDataUrl, slug) : undefined;
  return {
    rows: rowsFor(finalized, legacy?.url, upload),
    discard: () => Promise.allSettled([
      removeProductImagePaths(finalized.map((image) => image.storagePath)),
      ...(legacy ? [removeStoredProductImage(legacy)] : []),
    ]),
    stagingPaths: upload.stagedImages?.map((image) => image.stagingPath) ?? [],
  };
}

/** Best effort after a committed change: files nothing points to any more, and staging copies. */
async function removeUnusedFiles(urls: string[], stagingPaths: string[] = []) {
  const paths = [...urls.map(storagePathFromPublicUrl).filter((path): path is string => Boolean(path)), ...stagingPaths];
  if (!paths.length) return;
  try {
    await removeProductImagePaths(paths);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "product-photo-cleanup-failed", errorType: error instanceof Error ? error.name : typeof error }));
  }
}

type Layout = Array<Array<{ id: string } | NewRow>>;

/**
 * Rewrites the product's photographs to exactly `layout`, in order: existing rows get their new positions (and a
 * photoKey if they had none), new rows are created, rows left out are deleted. Positions are first moved out of the
 * way so the (productId, sortOrder) uniqueness never collides mid-way.
 */
async function writeLayout(tx: any, productId: string, current: MediaRecord[], layout: Layout) {
  const kept = new Set(layout.flat().flatMap((row) => ("id" in row ? [row.id] : [])));
  const removed = current.filter((row) => !kept.has(row.id)).map((row) => row.id);
  if (removed.length) await tx.productMedia.deleteMany({ where: { id: { in: removed } } });
  await tx.productMedia.updateMany({ where: { productId }, data: { sortOrder: { increment: 10_000 } } });
  let position = 0;
  for (const photo of layout) {
    const legacyKey = photo.some((row) => "id" in row && !current.find((item) => item.id === row.id)?.photoKey) ? randomUUID() : null;
    for (const row of photo) {
      if ("id" in row) {
        const existing = current.find((item) => item.id === row.id)!;
        await tx.productMedia.update({ where: { id: row.id }, data: { sortOrder: position, ...(existing.photoKey ? {} : { photoKey: legacyKey }) } });
      } else {
        await tx.productMedia.create({ data: { ...row, productId, sortOrder: position } });
      }
      position += 1;
    }
  }
}

async function loadForChange(tx: any, productId: string): Promise<{ slug: string; media: MediaRecord[] }> {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { slug: true, media: { select: MEDIA_SELECTION, orderBy: { sortOrder: "asc" } } } });
  if (!product) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
  return product;
}

function groups(media: MediaRecord[]): MediaRecord[][] {
  return groupPhotos(media);
}

function findPhoto(media: MediaRecord[], key: string): { photos: MediaRecord[][]; index: number } {
  const photos = groups(media);
  const index = photos.findIndex((photo) => keyOf(photo) === key);
  if (index < 0) throw new ApiError(404, "PHOTO_NOT_FOUND", "Photo not found");
  return { photos, index };
}

function assertNotDuplicate(media: MediaRecord[], contentHash: string | undefined, except?: MediaRecord[]) {
  if (!contentHash) return;
  const skip = new Set(except?.map((row) => row.id));
  if (media.some((row) => row.contentHash === contentHash && !skip.has(row.id))) {
    throw new ApiError(409, "DUPLICATE_PHOTO", "This photograph is already on this product");
  }
}

const asLayout = (photos: MediaRecord[][]): Layout => photos.map((photo) => photo.map((row) => ({ id: row.id })));

/** Adds a photograph after the existing ones (at most three in all). */
export async function addProductPhoto(productId: string, upload: PhotoUpload) {
  const before = await loadForChange(db, productId);
  if (groups(before.media).length >= MAX_PRODUCT_PHOTOS) throw new ApiError(409, "PHOTO_LIMIT", `A product can have up to ${MAX_PRODUCT_PHOTOS} photos`);
  assertNotDuplicate(before.media, upload.contentHash);
  const prepared = await prepareUpload(upload, before.slug);
  try {
    await db.$transaction(async (tx: any) => {
      const now = await loadForChange(tx, productId);
      const photos = groups(now.media);
      if (photos.length >= MAX_PRODUCT_PHOTOS) throw new ApiError(409, "PHOTO_LIMIT", `A product can have up to ${MAX_PRODUCT_PHOTOS} photos`);
      assertNotDuplicate(now.media, upload.contentHash);
      await writeLayout(tx, productId, now.media, [...asLayout(photos), prepared.rows]);
    });
  } catch (error) {
    await prepared.discard();
    throw error;
  }
  await removeUnusedFiles([], prepared.stagingPaths);
}

/** Replaces one photograph in its place; the others are untouched. */
export async function replaceProductPhoto(productId: string, key: string, upload: PhotoUpload) {
  const before = await loadForChange(db, productId);
  const target = findPhoto(before.media, key);
  assertNotDuplicate(before.media, upload.contentHash, target.photos[target.index]);
  const prepared = await prepareUpload(upload, before.slug);
  let replaced: MediaRecord[] = [];
  try {
    await db.$transaction(async (tx: any) => {
      const now = await loadForChange(tx, productId);
      const { photos, index } = findPhoto(now.media, key);
      assertNotDuplicate(now.media, upload.contentHash, photos[index]);
      replaced = photos[index];
      const layout = asLayout(photos);
      layout[index] = prepared.rows;
      await writeLayout(tx, productId, now.media, layout);
    });
  } catch (error) {
    await prepared.discard();
    throw error;
  }
  await removeUnusedFiles(replaced.map((row) => row.url), prepared.stagingPaths);
}

/** Removes one photograph. The last one cannot be removed: every product keeps at least one photo. */
export async function removeProductPhoto(productId: string, key: string) {
  let removed: MediaRecord[] = [];
  await db.$transaction(async (tx: any) => {
    const now = await loadForChange(tx, productId);
    const { photos, index } = findPhoto(now.media, key);
    if (photos.length <= 1) throw new ApiError(409, "LAST_PHOTO", "A product needs at least one photo. Replace this one instead");
    removed = photos[index];
    await writeLayout(tx, productId, now.media, asLayout(photos.filter((_, position) => position !== index)));
  });
  await removeUnusedFiles(removed.map((row) => row.url));
}

/** Puts the photographs in the given order; the first becomes the main photo. Every current photo must be listed once. */
export async function reorderProductPhotos(productId: string, keys: string[]) {
  await db.$transaction(async (tx: any) => {
    const now = await loadForChange(tx, productId);
    const photos = groups(now.media);
    const byKey = new Map(photos.map((photo) => [keyOf(photo), photo]));
    if (keys.length !== photos.length || new Set(keys).size !== keys.length || keys.some((key) => !byKey.has(key))) {
      throw new ApiError(409, "PHOTOS_CHANGED", "The photos changed while you were arranging them. Reload and try again");
    }
    await writeLayout(tx, productId, now.media, asLayout(keys.map((key) => byKey.get(key)!)));
  });
}

/** The description a screen reader hears for one photograph (both of its files). */
export async function describeProductPhoto(productId: string, key: string, altText: string) {
  await db.$transaction(async (tx: any) => {
    const now = await loadForChange(tx, productId);
    const { photos, index } = findPhoto(now.media, key);
    await tx.productMedia.updateMany({ where: { id: { in: photos[index].map((row) => row.id) } }, data: { altText } });
  });
}
