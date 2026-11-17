// Which files admin accepts as product photographs. In production the browser resizes the photo before upload, so
// large originals are fine; in development the photo is sent as it is.
export const PRODUCTION_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const DEVELOPMENT_IMAGE_TYPES = [...PRODUCTION_IMAGE_TYPES, "image/gif"];

export const acceptedPhotoTypes = () => (import.meta.env.PROD ? PRODUCTION_IMAGE_TYPES : DEVELOPMENT_IMAGE_TYPES).join(",");

export function imageProblem(file: File, isArabic: boolean): string | null {
  const accepted = import.meta.env.PROD ? PRODUCTION_IMAGE_TYPES : DEVELOPMENT_IMAGE_TYPES;
  const maximumBytes = import.meta.env.PROD ? 20 * 1024 * 1024 : 2 * 1024 * 1024;
  if (accepted.includes(file.type) && file.size <= maximumBytes) return null;
  if (import.meta.env.PROD) return isArabic ? "اختر صورة JPEG أو PNG أو WebP أصغر من 20 ميجابايت." : "Choose a JPEG, PNG, or WebP image smaller than 20 MB.";
  return isArabic ? "اختر صورة PNG أو JPEG أو WebP أو GIF أصغر من 2 ميجابايت." : "Choose a PNG, JPEG, WebP, or GIF image smaller than 2 MB.";
}
