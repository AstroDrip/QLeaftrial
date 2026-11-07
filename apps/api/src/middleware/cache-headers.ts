import type { NextFunction, Request, Response } from "express";

// Browsers always revalidate; the CDN answers for 60s and then keeps serving the last copy while it
// refreshes in the background (up to a day), so a visitor never waits on a cold function or the
// database. Checkout re-checks prices and stock on the server, so a briefly stale listing is safe.
export const PUBLIC_CATALOG_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=86400";

export function applyCacheHeaders(response: Response) {
  response.setHeader("Cache-Control", PUBLIC_CATALOG_CACHE);
}

// For content the shop edits and expects to see straight away (customer stories): Vercel's CDN may keep a
// copy for a minute and serve a stale one while it refreshes, but browsers must always revalidate, so
// nobody is shown their own cached copy after a reload.
export function applyEdgeOnlyCacheHeaders(response: Response) {
  response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  response.setHeader("Vercel-CDN-Cache-Control", "s-maxage=60, stale-while-revalidate=86400");
}

export function cacheProductList(_request: Request, response: Response, next: NextFunction) {
  applyCacheHeaders(response);
  next();
}

export function cacheProductDetail(_request: Request, response: Response, next: NextFunction) {
  applyCacheHeaders(response);
  next();
}
