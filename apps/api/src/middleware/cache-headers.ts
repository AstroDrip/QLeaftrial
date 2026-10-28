import type { NextFunction, Request, Response } from "express";

// Browsers always revalidate; the CDN may answer for 30s and refresh in the
// background, so first visits rarely wait on the database. Checkout re-checks
// prices and stock on the server, so a briefly stale listing is safe.
export const PUBLIC_CATALOG_CACHE = "public, max-age=0, s-maxage=30, stale-while-revalidate=300";

export function applyCacheHeaders(response: Response) {
  response.setHeader("Cache-Control", PUBLIC_CATALOG_CACHE);
}

export function cacheProductList(_request: Request, response: Response, next: NextFunction) {
  applyCacheHeaders(response);
  next();
}

export function cacheProductDetail(_request: Request, response: Response, next: NextFunction) {
  applyCacheHeaders(response);
  next();
}
