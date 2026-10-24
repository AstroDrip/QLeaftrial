export type ProductImageVariant = {
  purpose: "catalog" | "detail";
  blob: Blob;
  contentType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
};

const VARIANTS = [
  { purpose: "catalog" as const, longestEdge: 640 },
  { purpose: "detail" as const, longestEdge: 1400 },
];
const WEBP_QUALITY = 0.82;
const ACCEPTED_SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function dimensionsWithin(width: number, height: number, longestEdge: number) {
  const scale = Math.min(1, longestEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The product image could not be encoded as WebP."));
    }, "image/webp", WEBP_QUALITY);
  });
}

export async function createProductImageVariants(file: File): Promise<ProductImageVariant[]> {
  if (!ACCEPTED_SOURCE_TYPES.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP product image.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("The selected product image could not be decoded.");
  }

  try {
    if (bitmap.width < 1 || bitmap.height < 1) {
      throw new Error("The selected product image has invalid dimensions.");
    }

    const variants: ProductImageVariant[] = [];
    for (const variant of VARIANTS) {
      const size = dimensionsWithin(bitmap.width, bitmap.height, variant.longestEdge);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image optimization is unavailable in this browser.");
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await canvasBlob(canvas);
      if (blob.size > 2 * 1024 * 1024) {
        throw new Error("The optimized product image is larger than 2 MB.");
      }
      variants.push({
        purpose: variant.purpose,
        blob,
        contentType: "image/webp",
        byteSize: blob.size,
        width: size.width,
        height: size.height,
      });
    }
    return variants;
  } finally {
    bitmap.close();
  }
}
