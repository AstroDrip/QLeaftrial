import { compareCategories } from "./shop-categories";
/**
 * The public catalogue, available before (and without) the live product API.
 *
 * What is shown, in the order it becomes available:
 *  1. the copy this browser saved on an earlier visit (at once);
 *  2. /catalogue/catalogue.json, the snapshot written at build time, served by the static host;
 *  3. GET /api/v1/catalogue, CDN-cached for a minute and served stale for up to a day while it refreshes.
 * The static and the live copy are requested together, not one after the other, so a slow API never holds back
 * the static one. Whichever valid copy was generated most recently is shown, and an older copy never replaces a
 * newer one. The freshest copy is saved in this browser for the next visit.
 *
 * This is for showing products only. Checkout always re-reads prices, publication and stock on the server.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { idbGet, idbSet } from "../../lib/idb";
import type { CatalogueProduct, CatalogueSnapshot } from "./catalogue-types";

export const CATALOGUE_API_URL = "/api/v1/catalogue";
export const STATIC_CATALOGUE_URL = "/catalogue/catalogue.json";
export const CATALOGUE_STORAGE_KEY = "qleaves-catalogue-v2";
export const CATALOGUE_QUERY_KEY = ["catalogue"] as const;
export const CATALOGUE_DATABASE = "qleaves-catalogue";
const CATALOGUE_STORE = "snapshots";
const CATALOGUE_RECORD = "current";
// The live copy gets a short wait: the static copy and the saved copy are already on screen by then.
const LIVE_TIMEOUT_MS = 4_000;
const STATIC_TIMEOUT_MS = 8_000;
// A saved copy older than this is not shown at all: better a short loading state than week-old prices.
const MAX_CACHED_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// localStorage is read synchronously on every page load, so it only holds a catalogue that is small enough to
// parse instantly. A larger one lives in IndexedDB alone.
const MAX_LOCAL_STORAGE_CHARS = 1_500_000;

export type CatalogueSource = "live" | "snapshot";

export interface LoadedCatalogue extends CatalogueSnapshot {
  source: CatalogueSource;
}

interface CachedCatalogue {
  snapshot: CatalogueSnapshot;
  savedAt: number;
}

export function isSnapshot(body: unknown): body is CatalogueSnapshot {
  if (!body || typeof body !== "object") return false;
  const snapshot = body as Partial<CatalogueSnapshot>;
  return typeof snapshot.version === "string" && Boolean(snapshot.version) && Array.isArray(snapshot.products) &&
    // A copy that says it holds more (or fewer) products than it does was cut short or damaged on the way.
    (typeof snapshot.productCount !== "number" || snapshot.productCount === snapshot.products.length) &&
    snapshot.products.every((product: Partial<CatalogueProduct>) =>
      Boolean(product) && typeof product.id === "string" && Boolean(product.id) &&
      typeof product.slug === "string" && Boolean(product.slug) &&
      typeof product.name === "string" && Boolean(product.name) &&
      typeof product.priceQar === "number" && Number.isFinite(product.priceQar));
}

/**
 * When a copy was generated, as a number: later means it reflects a later state of the shop. The generation time
 * is used rather than the version, because the version is the newest change among published products and can go
 * backwards when a product is unpublished or deleted.
 */
export function catalogueFreshness(snapshot: { generatedAt?: string; version?: string } | null | undefined): number {
  if (!snapshot) return 0;
  const generated = Date.parse(snapshot.generatedAt ?? "");
  if (!Number.isNaN(generated)) return generated;
  const version = Date.parse(snapshot.version ?? "");
  return Number.isNaN(version) ? 0 : version;
}

function usable(cached: Partial<CachedCatalogue> | null | undefined, now: number): cached is CachedCatalogue {
  return Boolean(cached) && typeof cached!.savedAt === "number" && isSnapshot(cached!.snapshot) && now - cached!.savedAt <= MAX_CACHED_AGE_MS;
}

/** The small synchronous copy (localStorage): what a page can show in its very first render. */
export function readCachedCatalogue(now = Date.now()): { snapshot: CatalogueSnapshot; savedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CATALOGUE_STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedCatalogue>;
    return usable(cached, now) ? { snapshot: cached.snapshot, savedAt: cached.savedAt } : null;
  } catch {
    return null;
  }
}

/** The saved copy from either store (IndexedDB holds the full catalogue however large), freshest first. */
export async function readStoredCatalogue(now = Date.now()): Promise<{ snapshot: CatalogueSnapshot; savedAt: number } | null> {
  const local = readCachedCatalogue(now);
  let stored: CachedCatalogue | null = null;
  try {
    const record = await idbGet<Partial<CachedCatalogue>>(CATALOGUE_DATABASE, CATALOGUE_STORE, CATALOGUE_RECORD);
    if (usable(record, now)) stored = record;
  } catch {
    // IndexedDB missing or blocked: the localStorage copy, if any, still works.
  }
  if (stored && local) return catalogueFreshness(stored.snapshot) >= catalogueFreshness(local.snapshot) ? stored : local;
  return stored ?? local;
}

export function writeCachedCatalogue(snapshot: CatalogueSnapshot): void {
  if (typeof window === "undefined") return;
  const cached: CachedCatalogue = { snapshot, savedAt: Date.now() };
  // The full copy, however large. Failure is fine: this visit keeps its in-memory copy.
  void idbSet(CATALOGUE_DATABASE, CATALOGUE_STORE, CATALOGUE_RECORD, cached).catch(() => undefined);
  try {
    const serialised = JSON.stringify(cached);
    if (serialised.length <= MAX_LOCAL_STORAGE_CHARS) window.localStorage.setItem(CATALOGUE_STORAGE_KEY, serialised);
    else window.localStorage.removeItem(CATALOGUE_STORAGE_KEY);
    // The previous format is no longer read.
    window.localStorage.removeItem("qleaves-catalogue-v1");
  } catch {
    // Storage full or blocked: the in-memory copy still works for this visit.
  }
}

async function fetchJson(url: string, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * Loads the catalogue. `onProgress` is called each time a fresher copy becomes available (saved, static, live), so
 * the page can show the first one it gets instead of waiting for the slowest request.
 */
export async function fetchCatalogue(signal?: AbortSignal, onProgress?: (catalogue: LoadedCatalogue) => void): Promise<LoadedCatalogue> {
  let best: LoadedCatalogue | null = null;
  let savedFreshness = 0;
  // The live copy wins a tie (it is the same data, straight from the shop); any other copy must be strictly newer.
  const offer = (snapshot: CatalogueSnapshot, source: CatalogueSource): boolean => {
    const mine = catalogueFreshness(snapshot);
    const theirs = catalogueFreshness(best);
    if (best && (source === "live" ? mine < theirs : mine <= theirs)) return false;
    best = { ...snapshot, source };
    onProgress?.(best);
    return true;
  };

  const stored = await readStoredCatalogue();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (stored) {
    savedFreshness = catalogueFreshness(stored.snapshot);
    offer(stored.snapshot, "snapshot");
  }

  const accept = (source: CatalogueSource) => (body: unknown) => {
    if (isSnapshot(body)) offer(body, source);
  };
  await Promise.allSettled([
    fetchJson(CATALOGUE_API_URL, LIVE_TIMEOUT_MS, signal).then(accept("live")),
    fetchJson(STATIC_CATALOGUE_URL, STATIC_TIMEOUT_MS, signal).then(accept("snapshot")),
  ]);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const loaded = best as LoadedCatalogue | null;
  if (!loaded) throw new Error("The catalogue could not be loaded");
  if (catalogueFreshness(loaded) > savedFreshness || (loaded.source === "live" && !readCachedCatalogue())) {
    const { source: _source, ...snapshot } = loaded;
    writeCachedCatalogue(snapshot);
  }
  return loaded;
}

/** The catalogue for display: the browser's saved copy at once, then refreshed in the background. */
export function useCatalogue() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: CATALOGUE_QUERY_KEY,
    queryFn: ({ signal }) => fetchCatalogue(signal, (catalogue) => {
      // Shown as soon as it is known, unless something at least as fresh is already on screen.
      queryClient.setQueryData<LoadedCatalogue>(CATALOGUE_QUERY_KEY, (current) =>
        current && catalogueFreshness(current) >= catalogueFreshness(catalogue) && !(catalogue.source === "live" && current.source !== "live") ? current : catalogue);
    }),
    initialData: () => {
      const cached = readCachedCatalogue();
      return cached ? { ...cached.snapshot, source: "snapshot" as const } : undefined;
    },
    initialDataUpdatedAt: () => readCachedCatalogue()?.savedAt,
    staleTime: 60_000,
    retry: 1,
  });
}

export function categoryCounts(products: CatalogueProduct[]): Array<{ category: string; categoryAr: string | null; count: number }> {
  const counts = new Map<string, { categoryAr: string | null; count: number }>();
  for (const product of products) {
    const entry = counts.get(product.category) ?? { categoryAr: product.categoryAr, count: 0 };
    entry.count += 1;
    entry.categoryAr ??= product.categoryAr;
    counts.set(product.category, entry);
  }
  return [...counts.entries()]
    .map(([category, entry]) => ({ category, ...entry }))
    .sort((a, b) => compareCategories(a.category, b.category));
}
