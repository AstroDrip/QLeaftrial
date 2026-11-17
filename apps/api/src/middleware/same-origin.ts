import type { NextFunction, Request, Response } from "express";
import { ApiError } from "./error-handler.js";

// Admin and sign-in changes must come from the QLeaves site itself. Browsers send an Origin header with every
// cross-site POST, PUT, PATCH and DELETE, so a page on another site that tries to act with the admin's cookie is
// refused here (the SameSite=Lax cookie already blocks most of this; this is the second lock). Requests without an
// Origin or Referer (scripts, server-to-server calls, tests) are not browser cross-site requests and pass.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PROTECTED = /^\/(admin|auth)(\/|$)/;

function allowedOrigins(): Set<string> {
  const configured = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return new Set(["https://qleaves.qa", "https://www.qleaves.qa", ...configured]);
}

function originOf(request: Request): string | null {
  const origin = request.get("origin");
  if (origin && origin !== "null") return origin;
  if (origin === "null") return "null";
  const referer = request.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return "null";
  }
}

export function isAllowedOrigin(origin: string, request: Request): boolean {
  if (allowedOrigins().has(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  // The site's own host (Vercel previews, a custom domain) is always the same origin.
  const host = request.get("x-forwarded-host") ?? request.get("host");
  if (host && url.host === host) return true;
  // Local development: the Vite dev server and preview proxy from localhost on another port.
  return process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function requireSameOrigin(request: Request, _response: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(request.method) || !PROTECTED.test(request.path)) return next();
  const origin = originOf(request);
  if (origin === null || isAllowedOrigin(origin, request)) return next();
  next(new ApiError(403, "FORBIDDEN_ORIGIN", "This change must be made from the QLeaves site"));
}
