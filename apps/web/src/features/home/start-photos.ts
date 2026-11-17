import type { ProductSummary } from "../catalog/product-types";
import { distinctPhotos } from "../catalog/product-photos";
import { mix } from "./home-shelves";

// Which photograph each card opens on: chosen by the visitor's seed, and never a picture another card on the page
// already opens on (the same file listed under two products is shown once).
export function startPhotos(items: ProductSummary[], seed: number): Record<string, number> {
  const used = new Set<string>();
  const result: Record<string, number> = {};
  for (const item of items) {
    const photos = distinctPhotos(item.media?.length ? item.media : item.image ? [item.image] : []);
    const first = photos.length > 1 ? mix(seed, item.id) % photos.length : 0;
    let chosen = first;
    for (let step = 0; step < photos.length; step += 1) {
      const index = (first + step) % photos.length;
      if (!photos[index].some((media) => used.has(media.url))) { chosen = index; break; }
    }
    photos[chosen]?.forEach((media) => used.add(media.url));
    result[item.id] = chosen;
  }
  return result;
}
