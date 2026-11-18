import { canonicalCategory } from "./shop-categories.js";

// The homepage shelves, shared by the bootstrap builder (which ships every product a shelf might show) and the
// homepage itself (which picks from the same pools). Each visitor gets a seed for the browsing session, renewed
// daily: it decides which products from a pool are shown and in what order, so returning visitors see variety
// while one visit stays stable. The shop page is not affected.
//
//   Featured   the shop's own selection (newest 16 featured); which 8 and their order vary.
//   New        the 16 newest plants (never Garden Accessories); 8 of them, shown newest first.
//   Offers     genuine reductions (newest 12); order varies.
//   Easy care / lower light   in-stock plants (newest 16 each); 4 shown, order varies.
// A product appears on one shelf only, in the order above.
export const SHELF_SIZE = 8;
export const DISCOVERY_SIZE = 4;
export const NOT_NEW_ARRIVALS = new Set(["Garden Accessories"]);
export const LOW_LIGHT = "Low to bright indirect";
export const SHELF_IDS = ["featured", "new", "offers", "easy", "lowLight"] as const;
export type ShelfId = (typeof SHELF_IDS)[number];
const POOL: Record<ShelfId, number> = { featured: 16, new: 16, offers: 12, easy: 16, lowLight: 16 };
const SHOW: Record<ShelfId, number> = { featured: SHELF_SIZE, new: SHELF_SIZE, offers: SHELF_SIZE, easy: DISCOVERY_SIZE, lowLight: DISCOVERY_SIZE };

export type ShelfProduct = {
  id: string; category: string; priceQar: number; compareAtPriceQar?: number | null; featured?: boolean | null;
  careLevel?: string | null; light?: string | null; inStock: boolean;
};

const isOffer = (product: ShelfProduct) => product.priceQar > 0 && product.compareAtPriceQar != null && product.compareAtPriceQar > product.priceQar;
const isPlant = (product: ShelfProduct) => !NOT_NEW_ARRIVALS.has(canonicalCategory(product.category));

/** Every candidate for each shelf, newest first (the input must already be newest first). */
export function shelfPools<T extends ShelfProduct>(newestFirst: T[], newest: T[] = newestFirst): Record<ShelfId, T[]> {
  const featured = newestFirst.filter((product) => product.featured).slice(0, POOL.featured);
  const fresh = newest.filter(isPlant).slice(0, POOL.new);
  // Discovery shelves skip anything Featured or New might show, so they stay full whatever those shelves pick.
  const taken = new Set([...featured, ...fresh].map((product) => product.id));
  const discovery = (test: (product: T) => boolean) => newestFirst.filter((product) => !taken.has(product.id) && product.inStock && test(product));
  return {
    featured,
    new: fresh,
    offers: newestFirst.filter(isOffer).slice(0, POOL.offers),
    easy: discovery((product) => product.careLevel === "easy").slice(0, POOL.easy),
    lowLight: discovery((product) => product.light === LOW_LIGHT).slice(0, POOL.lowLight),
  };
}

/** A small, fast pseudo-random generator: the same seed always gives the same numbers. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A whole number from a seed and a text, so each shelf (or product) gets its own sequence from one seed. */
export function mix(seed: number, text: string): number {
  let hash = (seed ^ 0x811c9dc5) >>> 0;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16_777_619) >>> 0;
  return hash;
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

/** The shelves for one visitor: no product twice; New Arrivals stays newest first, the others vary in order too. */
export function pickShelves<T extends ShelfProduct>(pools: Record<ShelfId, T[]>, seed: number, options: { offers?: boolean } = {}): Record<ShelfId, T[]> {
  const shown = new Set<string>();
  const result = {} as Record<ShelfId, T[]>;
  for (const id of SHELF_IDS) {
    if (id === "offers" && options.offers === false) { result[id] = []; continue; }
    const free = pools[id].filter((product) => !shown.has(product.id));
    let picked = seededShuffle(free, mix(seed, id)).slice(0, SHOW[id]);
    if (id === "new") picked = free.filter((product) => picked.includes(product));
    picked.forEach((product) => shown.add(product.id));
    result[id] = picked;
  }
  return result;
}
