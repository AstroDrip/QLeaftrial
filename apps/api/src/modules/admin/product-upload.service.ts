import { randomUUID } from "node:crypto";
import { ApiError } from "../../middleware/error-handler.js";
import {
  detectedImageType,
  objectPathUrl,
  productImageStorageConfig,
  publicObjectUrl,
  storageHeaders,
} from "./product-image-storage.js";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8_000;
// Supabase signed-upload tokens have a fixed two-hour validity period.
const SIGNED_UPLOAD_LIFETIME_MS = 2 * 60 * 60_000;

export type ProductImagePurpose = "catalog" | "detail";
export type DirectImageContentType = "image/png" | "image/jpeg" | "image/webp";

export type ProductUploadMetadata = {
  purpose: ProductImagePurpose;
  contentType: DirectImageContentType;
  byteSize: number;
  width: number;
  height: number;
};

export type StagedProductImage = ProductUploadMetadata & {
  stagingPath: string;
};

export type ValidatedStagedImage = StagedProductImage & {
  bytes: Buffer;
  extension: "png" | "jpg" | "webp";
};

export type FinalProductImage = ProductUploadMetadata & {
  url: string;
  storagePath: string;
};

const extensionFor: Record<DirectImageContentType, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function invalidImage(message: string): ApiError {
  return new ApiError(400, "INVALID_PRODUCT_IMAGE", message);
}

function validateMetadata(metadata: ProductUploadMetadata): void {
  if (!(metadata.contentType in extensionFor)) {
    throw invalidImage("Use a JPEG, PNG, or WebP product image");
  }
  if (!Number.isInteger(metadata.byteSize) || metadata.byteSize < 1 || metadata.byteSize > MAX_IMAGE_BYTES) {
    throw invalidImage("Product images must be 2 MB or smaller");
  }
  for (const [label, dimension] of [["width", metadata.width], ["height", metadata.height]] as const) {
    if (!Number.isInteger(dimension) || dimension < 1 || dimension > MAX_IMAGE_DIMENSION) {
      throw invalidImage(`Product image ${label} is invalid`);
    }
  }
}

function signedUploadUrl(baseUrl: string, bucket: string, path: string, token: string): string {
  return `${baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}?token=${encodeURIComponent(token)}`;
}

export async function authorizeProductUpload(metadata: ProductUploadMetadata): Promise<{
  path: string;
  token: string;
  uploadUrl: string;
  expiresAt: string;
}> {
  validateMetadata(metadata);
  const { baseUrl, bucket, apiKey, legacyBearer } = productImageStorageConfig();
  const path = `products/staging/${randomUUID()}/${metadata.purpose}.${extensionFor[metadata.contentType]}`;
  const authorizationUrl = `${baseUrl}/storage/v1/object/upload/sign/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(authorizationUrl, {
    method: "POST",
    headers: {
      ...storageHeaders(apiKey, legacyBearer),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new ApiError(502, "IMAGE_UPLOAD_AUTHORIZATION_FAILED", "Product image upload could not be authorized");
  }

  const body = await response.json().catch(() => ({})) as { url?: unknown; token?: unknown };
  let token = typeof body.token === "string" ? body.token : undefined;
  if (!token && typeof body.url === "string") {
    try {
      token = new URL(body.url, baseUrl).searchParams.get("token") ?? undefined;
    } catch {
      token = undefined;
    }
  }
  if (!token) {
    throw new ApiError(502, "IMAGE_UPLOAD_AUTHORIZATION_FAILED", "Product image upload could not be authorized");
  }

  return {
    path,
    token,
    uploadUrl: signedUploadUrl(baseUrl, bucket, path, token),
    expiresAt: new Date(Date.now() + SIGNED_UPLOAD_LIFETIME_MS).toISOString(),
  };
}

async function boundedResponseBytes(response: Response): Promise<Buffer> {
  if (!response.body) throw invalidImage("Staged product image is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw invalidImage("Product images must be 2 MB or smaller");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

function imageDimensions(bytes: Buffer, contentType: DirectImageContentType): { width: number; height: number } | null {
  if (contentType === "image/png" && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (contentType === "image/jpeg" && bytes.length >= 4) {
    let offset = 2;
    const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (sofMarkers.has(marker)) {
        return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      }
      offset += length;
    }
  }

  if (contentType === "image/webp" && bytes.length >= 30) {
    const chunk = bytes.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 " && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      return {
        width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
        height: 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | (bytes[22] >> 6)),
      };
    }
  }

  return null;
}

function assertStagingPath(image: StagedProductImage): void {
  const extension = extensionFor[image.contentType];
  const escapedPurpose = image.purpose.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^products/staging/[0-9a-f]{8}-[0-9a-f-]{27}/${escapedPurpose}\\.${extension}$`, "i");
  if (!pattern.test(image.stagingPath)) {
    throw invalidImage("Product image staging path is invalid");
  }
}

export async function validateStagedImage(image: StagedProductImage): Promise<ValidatedStagedImage> {
  validateMetadata(image);
  assertStagingPath(image);
  const { baseUrl, bucket, apiKey, legacyBearer } = productImageStorageConfig();
  const response = await fetch(objectPathUrl(baseUrl, bucket, image.stagingPath), {
    headers: storageHeaders(apiKey, legacyBearer),
  });
  if (!response.ok) throw invalidImage("Staged product image could not be read");

  const bytes = await boundedResponseBytes(response);
  const detected = detectedImageType(bytes);
  const responseType = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim();
  const dimensions = imageDimensions(bytes, image.contentType);
  if (
    bytes.length !== image.byteSize ||
    detected?.mimeType !== image.contentType ||
    (responseType && responseType !== image.contentType) ||
    !dimensions ||
    dimensions.width !== image.width ||
    dimensions.height !== image.height
  ) {
    throw invalidImage("Staged product image metadata does not match its contents");
  }

  return { ...image, bytes, extension: detected.extension as "png" | "jpg" | "webp" };
}

async function removePath(path: string): Promise<void> {
  const { baseUrl, bucket, apiKey, legacyBearer } = productImageStorageConfig();
  const response = await fetch(objectPathUrl(baseUrl, bucket, path), {
    method: "DELETE",
    headers: storageHeaders(apiKey, legacyBearer),
  });
  if (!response.ok) throw new Error(`Storage cleanup failed with ${response.status}`);
}

export async function removeProductImagePaths(paths: string[]): Promise<void> {
  await Promise.all(paths.map(removePath));
}

export async function finalizeProductImages(images: StagedProductImage[], slug: string): Promise<FinalProductImage[]> {
  const purposes = new Set(images.map((image) => image.purpose));
  if (images.length !== 2 || !purposes.has("catalog") || !purposes.has("detail")) {
    throw invalidImage("Catalogue and detail product image variants are required");
  }

  const validated = await Promise.all(images.map(validateStagedImage));
  const config = productImageStorageConfig();
  const createdPaths: string[] = [];
  try {
    const finalized: FinalProductImage[] = [];
    for (const image of validated) {
      const storagePath = `products/${slug}/${image.purpose}-${randomUUID()}.${image.extension}`;
      const response = await fetch(objectPathUrl(config.baseUrl, config.bucket, storagePath), {
        method: "POST",
        headers: {
          ...storageHeaders(config.apiKey, config.legacyBearer),
          "Content-Type": image.contentType,
          "x-upsert": "false",
        },
        body: new Uint8Array(image.bytes),
      });
      if (!response.ok) throw new ApiError(502, "IMAGE_UPLOAD_FAILED", "Product image could not be finalized");
      createdPaths.push(storagePath);
      finalized.push({
        purpose: image.purpose,
        contentType: image.contentType,
        byteSize: image.byteSize,
        width: image.width,
        height: image.height,
        storagePath,
        url: publicObjectUrl(config.baseUrl, config.bucket, storagePath),
      });
    }
    return finalized;
  } catch (error) {
    await Promise.allSettled(createdPaths.map(removePath));
    throw error;
  }
}
