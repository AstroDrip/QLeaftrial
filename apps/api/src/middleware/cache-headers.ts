import type { NextFunction, Request, Response } from "express";

function applyCacheHeaders(response: Response, maxAgeSeconds: number) {
  response.setHeader("Cache-Control", `public, max-age=${maxAgeSeconds}, must-revalidate`);
}

export function cacheProductList(_request: Request, response: Response, next: NextFunction) {
  applyCacheHeaders(response, 60);
  next();
}

export function cacheProductDetail(_request: Request, response: Response, next: NextFunction) {
  applyCacheHeaders(response, 120);
  next();
}
