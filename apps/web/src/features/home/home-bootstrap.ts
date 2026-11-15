// The homepage's built-in data: a small cut of the catalogue that the build writes into index.html (see
// vite.config.ts and apps/api/src/lib/home-bootstrap.ts). Reading it needs no request, so a first-time visitor
// sees categories and products even while the API is slow or down. Display only.
import { isHomeBootstrap, type HomeBootstrap } from "../../../../api/src/lib/home-bootstrap";

export type { HomeBootstrap };
export const HOME_BOOTSTRAP_ELEMENT_ID = "qleaves-home-bootstrap";

let cached: HomeBootstrap | null | undefined;

/** The embedded bootstrap, or null when the page has none or it is unreadable (the page then loads as before). */
export function readHomeBootstrap(): HomeBootstrap | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (typeof document === "undefined") return cached;
  try {
    const text = document.getElementById(HOME_BOOTSTRAP_ELEMENT_ID)?.textContent;
    if (text) {
      const parsed: unknown = JSON.parse(text);
      if (isHomeBootstrap(parsed)) cached = parsed;
    }
  } catch {
    // Damaged data is ignored; the live catalogue takes over.
  }
  return cached;
}

/** For tests: forget what was read so the next call reads the document again. */
export function resetHomeBootstrapForTests(): void {
  cached = undefined;
}
