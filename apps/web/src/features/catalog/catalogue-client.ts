/**
 * The public catalogue, available before (and without) the live product API.
 *
 * Order of sources, best first:
 *  1. GET /api/v1/catalogue: CDN-cached for a minute and served stale for up to a day while it refreshes,
 *     so it usually answers from the edge even when the function is cold or the database is briefly down.
 *  2. /catalogue/catalogue.json: the snapshot written at build time, the last resort.
 * The last good copy is also kept in this browser, so a returning visitor sees products at once.
 *
 * This is for showing products only. Checkout always re-reads prices, publication and stock on the server.
 */
import { useQuery } from "@tanstack/react-query";
import type { CatalogueProduct, CatalogueSnapshot } from "./catalogue-types";

export const CATALOGUE_API_URL = "/api/v1/catalogue";
export const STATIC_CATALOGUE_URL = "/catalogue/catalogue.json";
export const CATALOGUE_STORAGE_KEY = "qleaves-catalogue-v2";
export const CATALOGUE_QUERY_KEY = ["catalogue"] as const;
const FETCH_TIMEOUT_MS = 12_000;
// A saved copy older than this is not shown at all: better a short loading state than week-old prices.
const MAX_CACHED_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CatalogueSource = "live" | "snapshot";

export interface LoadedCatalogue extends CatalogueSnapshot {
  source: CatalogueSource;
}

interface CachedCatalogue {
  snapshot: CatalogueSnapshot;
  savedAt: number;
}

function isSnapshot(body: unknown): body is CatalogueSnapshot {
  if (!body || typeof body !== "object") return false;
  const snapshot = body as Partial<CatalogueSnapshot>;
  return typeof snapshot.version === "string" && Boolean(snapshot.version) && Array.isArray(snapshot.products) &&
    snapshot.products.every((product: Partial<CatalogueProduct>) =>
      Boolean(product) && typeof product.id === "string" && Boolean(product.id) &&
      typeof product.slug === "string" && Boolean(product.slug) &&
      typeof product.name === "string" && Boolean(product.name) &&
      typeof product.priceQar === "number");
}

export function readCachedCatalogue(now = Date.now()): { snapshot: CatalogueSnapshot; savedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CATALOGUE_STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedCatalogue>;
    if (!cached || typeof cached.savedAt !== "number" || !isSnapshot(cached.snapshot)) return null;
    if (now - cached.savedAt > MAX_CACHED_AGE_MS) return null;
    return { snapshot: cached.snapshot, savedAt: cached.savedAt };
  } catch {
    return null;
  }
}

export function writeCachedCatalogue(snapshot: CatalogueSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedCatalogue = { snapshot, savedAt: Date.now() };
    window.localStorage.setItem(CATALOGUE_STORAGE_KEY, JSON.stringify(cached));
    // The previous format is no longer read.
    window.localStorage.removeItem("qleaves-catalogue-v1");
  } catch {
    // Storage full or blocked: the in-memory copy still works for this visit.
  }
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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

export async function fetchCatalogue(signal?: AbortSignal): Promise<LoadedCatalogue> {
  try {
    const live = await fetchJson(CATALOGUE_API_URL, signal);
    if (isSnapshot(live)) {
      writeCachedCatalogue(live);
      return { ...live, source: "live" };
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  const fallback = await fetchJson(STATIC_CATALOGUE_URL, signal);
  if (!isSnapshot(fallback)) throw new Error("The saved catalogue is not readable");
  // A build snapshot never replaces a newer copy this browser already has.
  const cached = readCachedCatalogue();
  if (cached && cached.snapshot.version > fallback.version) return { ...cached.snapshot, source: "snapshot" };
  return { ...fallback, source: "snapshot" };
}

/** The catalogue for display: the browser's saved copy at once, then refreshed in the background. */
export function useCatalogue() {
  return useQuery({
    queryKey: CATALOGUE_QUERY_KEY,
    queryFn: ({ signal }) => fetchCatalogue(signal),
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
    .sort((a, b) => a.category.localeCompare(b.category));
}
