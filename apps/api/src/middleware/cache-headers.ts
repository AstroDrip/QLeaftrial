import type { NextFunction, Request, Response } from "express";

function applyCacheHeaders(response: Response) {
  response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
}

export function cacheProductList(_request: Request, response: Response, next: NextFunction) {
  applyCacheHeaders(response);
  next();
}

export function cacheProductDetail(_request: Request, response: Response, next: NextFunction) {
  applyCacheHeaders(response);
  next();
}
