/**
 * Public catalogue snapshot loading with stale-while-revalidate behaviour.
 *
 * The storefront renders from a cached snapshot immediately (shell first, no
 * backend wait), then refreshes from the static catalogue URL in the
 * background. A failed refresh keeps the last known-good snapshot and marks it
 * stale instead of replacing usable products with an error screen.
 */
import type { CatalogueProduct, CatalogueSnapshot } from "./catalogue-types";

export const STATIC_CATALOGUE_URL = "/catalogue/catalogue.json";
export const CATALOGUE_STORAGE_KEY = "qleaves-catalogue-v1";

// How long a cached snapshot is considered fresh before a background refresh.
export const CATALOGUE_REFRESH_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

export interface CachedCatalogue {
  version: string;
  products: CatalogueProduct[];
  fetchedAt: number;
}

export interface CatalogueState {
  products: CatalogueProduct[];
  version: string;
  /** True when the last fetch failed or the copy is older than the refresh TTL. */
  stale: boolean;
  /** True while a background refresh is in flight. */
  isRefreshing: boolean;
  /** True when the most recent refresh replaced the shown products. */
  updated: boolean;
  error: string | null;
}

function abortControllerWithTimeout(
  externalSignal: AbortSignal | undefined,
): { signal: AbortSignal; abort: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const abort = () => {
    clearTimeout(timeout);
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abort();
    } else {
      externalSignal.addEventListener("abort", abort, { once: true });
    }
  }

  return { signal: controller.signal, abort };
}

export function readCachedCatalogue(): CachedCatalogue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CATALOGUE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalogue;
    if (
      !parsed ||
      typeof parsed.version !== "string" ||
      !parsed.version ||
      !Array.isArray(parsed.products)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedCatalogue(snapshot: CatalogueSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const cached: CachedCatalogue = {
      version: snapshot.version,
      products: snapshot.products,
      fetchedAt: Date.now(),
    };
    window.localStorage.setItem(
      CATALOGUE_STORAGE_KEY,
      JSON.stringify(cached),
    );
  } catch {
    // localStorage unavailable or full: continue without caching.
  }
}

export function isCatalogueStale(cached: CachedCatalogue | null): boolean {
  if (!cached) return true;
  return Date.now() - cached.fetchedAt > CATALOGUE_REFRESH_TTL_MS;
}

function validateCatalogue(body: unknown): CatalogueSnapshot {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid catalogue format");
  }
  const snapshot = body as Partial<CatalogueSnapshot>;
  if (typeof snapshot.version !== "string" || !snapshot.version) {
    throw new Error("Catalogue missing version");
  }
  if (!Array.isArray(snapshot.products)) {
    throw new Error("Catalogue missing products");
  }
  for (const product of snapshot.products) {
    if (
      !product ||
      typeof product.id !== "string" ||
      !product.id ||
      typeof product.slug !== "string" ||
      !product.slug ||
      typeof product.name !== "string" ||
      !product.name ||
      typeof product.priceQar !== "number"
    ) {
      throw new Error("Catalogue contains an invalid product");
    }
  }
  return snapshot as CatalogueSnapshot;
}

export async function fetchCatalogueSnapshot(
  signal?: AbortSignal,
): Promise<CatalogueSnapshot> {
  const { signal: fetchSignal, abort } = abortControllerWithTimeout(signal);
  try {
    const response = await fetch(STATIC_CATALOGUE_URL, {
      signal: fetchSignal,
      headers: { Accept: "application/json" },
      cache: "no-cache",
    });
    if (!response.ok) {
      throw new Error(`Catalogue request failed (${response.status})`);
    }
    const body = await response.json();
    return validateCatalogue(body);
  } finally {
    abort();
  }
}

/**
 * Load the best available catalogue immediately.
 *
 * Prefers a previously cached snapshot, then the static catalogue. Falls back
 * to the caller-provided `apiFallback` only when neither is available, so the
 * storefront never blocks on the backend to show previously published products.
 */
export async function loadCatalogue({
  signal,
  apiFallback,
}: {
  signal?: AbortSignal;
  apiFallback?: () => Promise<CatalogueProduct[]>;
}): Promise<{
  snapshot: CatalogueSnapshot | null;
  products: CatalogueProduct[];
  source: "cache" | "static" | "api" | "none";
  stale: boolean;
}> {
  const cached = readCachedCatalogue();

  // Step 2: previously cached catalogue renders immediately.
  if (cached) {
    return {
      snapshot: null,
      products: cached.products,
      source: "cache",
      stale: isCatalogueStale(cached),
    };
  }

  // Step 1 / 3: fetch the static catalogue (immediate shell, background refresh).
  try {
    const snapshot = await fetchCatalogueSnapshot(signal);
    writeCachedCatalogue(snapshot);
    return { snapshot, products: snapshot.products, source: "static", stale: false };
  } catch {
    // A cached copy survives a failed refresh so browsing never goes blank.
    const cached = readCachedCatalogue();
    if (cached) {
      return {
        snapshot: null,
        products: cached.products,
        source: "cache",
        stale: true,
      };
    }
    if (apiFallback) {
      try {
        const products = await apiFallback();
        return {
          snapshot: null,
          products,
          source: "api",
          stale: false,
        };
      } catch {
        // fall through to "none"
      }
    }
    return { snapshot: null, products: [], source: "none", stale: true };
  }
}

export async function refreshCatalogue(): Promise<{
  snapshot: CatalogueSnapshot;
  changed: boolean;
}> {
  const snapshot = await fetchCatalogueSnapshot();
  const cached = readCachedCatalogue();
  const changed = !cached || cached.version !== snapshot.version;
  writeCachedCatalogue(snapshot);
  return { snapshot, changed };
}
