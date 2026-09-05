import { randomUUID } from "node:crypto";
import { ApiError } from "../../middleware/error-handler.js";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type SupportedImage = {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  extension: "png" | "jpg" | "webp" | "gif";
  bytes: Buffer;
};

export type StoredProductImage = {
  url: string;
  storagePath?: string;
};

export function detectedImageType(bytes: Buffer): Pick<SupportedImage, "mimeType" | "extension"> | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mimeType: "image/png", extension: "png" };
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }

  const prefix = bytes.subarray(0, 6).toString("ascii");
  if (prefix === "GIF87a" || prefix === "GIF89a") {
    return { mimeType: "image/gif", extension: "gif" };
  }

  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }

  return null;
}

export function parseProductImageDataUrl(dataUrl: string): SupportedImage {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) {
    throw new ApiError(400, "VALIDATION_ERROR", "Image must be a base64 encoded PNG, JPEG, WebP, or GIF");
  }

  const declaredMimeType = match[1] as SupportedImage["mimeType"];
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");

  if (bytes.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Image is empty");
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new ApiError(400, "VALIDATION_ERROR", "Image must be 2 MB or smaller");
  }

  const detected = detectedImageType(bytes);
  if (!detected || detected.mimeType !== declaredMimeType) {
    throw new ApiError(400, "VALIDATION_ERROR", "Image contents do not match the declared image type");
  }

  return { ...detected, bytes };
}

function usesPostgreSql(): boolean {
  return process.env.QLEAVES_DATABASE_PROVIDER === "postgresql";
}

export type ProductImageStorageConfig = {
  baseUrl: string;
  bucket: string;
  apiKey: string;
  legacyBearer: boolean;
};

export function productImageStorageConfig(): ProductImageStorageConfig {
  const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const bucket = process.env.SUPABASE_PRODUCT_IMAGE_BUCKET?.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const legacyKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const apiKey = secretKey || legacyKey;

  if (!baseUrl || !bucket || !apiKey) {
    throw new Error(
      "Supabase product image storage requires SUPABASE_URL, SUPABASE_PRODUCT_IMAGE_BUCKET, and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)",
    );
  }

  return { baseUrl, bucket, apiKey, legacyBearer: !secretKey && Boolean(legacyKey) };
}

export function objectPathUrl(baseUrl: string, bucket: string, storagePath: string): string {
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/${encodedBucket}/${encodedPath}`;
}

export function publicObjectUrl(baseUrl: string, bucket: string, storagePath: string): string {
  const encodedBucket = encodeURIComponent(bucket);
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
}

export function storageHeaders(apiKey: string, legacyBearer: boolean): Record<string, string> {
  const headers: Record<string, string> = { apikey: apiKey };
  if (legacyBearer) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

export async function storeProductImage(dataUrl: string, slug: string): Promise<StoredProductImage> {
  const parsed = parseProductImageDataUrl(dataUrl);

  if (!usesPostgreSql()) {
    return { url: dataUrl };
  }

  const { baseUrl, bucket, apiKey, legacyBearer } = productImageStorageConfig();
  const storagePath = `products/${slug}/${randomUUID()}.${parsed.extension}`;
  const response = await fetch(objectPathUrl(baseUrl, bucket, storagePath), {
    method: "POST",
    headers: {
      ...storageHeaders(apiKey, legacyBearer),
      "Content-Type": parsed.mimeType,
      "x-upsert": "false",
    },
    body: new Uint8Array(parsed.bytes),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Supabase product image upload failed", {
      status: response.status,
      detail: detail.slice(0, 500),
    });
    throw new ApiError(502, "IMAGE_UPLOAD_FAILED", "Product image could not be stored");
  }

  return {
    url: publicObjectUrl(baseUrl, bucket, storagePath),
    storagePath,
  };
}

export async function removeStoredProductImage(image: StoredProductImage): Promise<void> {
  if (!image.storagePath) return;

  const { baseUrl, bucket, apiKey, legacyBearer } = productImageStorageConfig();
  const response = await fetch(objectPathUrl(baseUrl, bucket, image.storagePath), {
    method: "DELETE",
    headers: storageHeaders(apiKey, legacyBearer),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase product image cleanup failed (${response.status}): ${detail.slice(0, 500)}`);
  }
}
