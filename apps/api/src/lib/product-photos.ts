// A product's photographs. Each photograph is stored as media rows in two sizes (a catalogue size for cards, a
// detail size for the product page), kept next to each other in sort order: a catalogue row followed by its detail
// row. These helpers group the rows back into photographs and keep each photograph only once, so a product is never
// shown with the same picture twice. Shared by the API (homepage data) and the storefront (cards, product page).
export type PhotoMedia = { url: string; purpose?: string | null };

export const MAX_PRODUCT_PHOTOS = 3;

/** Media rows grouped into photographs, in order. A catalogue row is joined by the detail row right after it. */
export function groupPhotos<T extends PhotoMedia>(media: readonly T[]): T[][] {
  const photos: T[][] = [];
  for (const item of media) {
    const last = photos[photos.length - 1];
    if (last && last.length === 1 && last[0].purpose === "catalog" && item.purpose === "detail") last.push(item);
    else photos.push([item]);
  }
  return photos;
}

/** The photograph's identity: its catalogue file if it has one, otherwise its only file. */
function identity(photo: readonly PhotoMedia[]): string {
  return (photo.find((item) => item.purpose === "catalog") ?? photo[0]).url;
}

/** Distinct photographs (no file shown twice), at most `limit`, in the shop's order. */
export function distinctPhotos<T extends PhotoMedia>(media: readonly T[], limit = MAX_PRODUCT_PHOTOS): T[][] {
  const seen = new Set<string>();
  const photos: T[][] = [];
  for (const photo of groupPhotos(media)) {
    const urls = photo.map((item) => item.url);
    if (urls.some((url) => seen.has(url))) continue;
    urls.forEach((url) => seen.add(url));
    photos.push(photo);
    if (photos.length >= limit) break;
  }
  return photos;
}

/** The catalogue-size file of each distinct photograph (what a product card needs), at most `limit`. */
export function catalogueSizePhotos<T extends PhotoMedia>(media: readonly T[], limit = MAX_PRODUCT_PHOTOS): T[] {
  return distinctPhotos(media, limit).map((photo) => photo.find((item) => item.purpose === "catalog") ?? photo[0]);
}

export { identity as photoIdentity };
