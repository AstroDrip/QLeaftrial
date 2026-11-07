const LONGEST_EDGE = 900;
const QUALITY = 0.85;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The photo could not be read."))));
    reader.addEventListener("error", () => reject(new Error("The photo could not be read.")));
    reader.readAsDataURL(file);
  });
}

// Customer photos only ever appear small, so they are shrunk in the browser to a WebP of at most 900px
// before upload. If the browser cannot decode or re-encode the file, the original is sent unchanged.
export async function reviewPhotoDataUrl(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LONGEST_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const encoded = canvas.toDataURL("image/webp", QUALITY);
    if (encoded.startsWith("data:image/webp")) return encoded;
  } catch {
    // fall through to the original file
  }
  return readAsDataUrl(file);
}

export const REVIEW_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const REVIEW_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
