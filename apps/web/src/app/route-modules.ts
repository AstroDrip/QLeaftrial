// Page chunks are code-split; these loaders are shared by the router and by
// prefetching so a page's code is usually downloaded before it is clicked.
export const loadCatalog = () => import("../features/catalog/CatalogPage");
export const loadProduct = () => import("../features/catalog/ProductPage");
export const loadCart = () => import("../features/cart/CartPage");
export const loadCheckout = () => import("../features/checkout/CheckoutPage");
export const loadConfirmation = () => import("../features/checkout/OrderConfirmationPage");
export const loadLegal = () => import("../features/legal/LegalPages");

const byPath: Array<[RegExp, () => Promise<unknown>]> = [
  [/^\/shop/, loadCatalog],
  [/^\/plants\//, loadProduct],
  [/^\/cart/, loadCart],
  [/^\/checkout/, loadCheckout],
  [/^\/(about|privacy|terms|shipping-returns)/, loadLegal],
];

const requested = new Set<() => Promise<unknown>>();

function load(loader: () => Promise<unknown>): void {
  if (requested.has(loader)) return;
  requested.add(loader);
  // A failed prefetch is retried by the router when the page is opened.
  loader().catch(() => requested.delete(loader));
}

export function prefetchRoute(path: string): void {
  const match = byPath.find(([pattern]) => pattern.test(path));
  if (match) load(match[1]);
}

// After the first page settles, quietly fetch the pages most visits go to next.
export function prefetchLikelyRoutes(): void {
  if (typeof window === "undefined") return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  const schedule = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500));
  schedule(() => [loadCatalog, loadProduct, loadCart].forEach(load));
}
