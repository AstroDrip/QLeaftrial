import type { RequestHandler } from "express";
import { ApiError } from "../../middleware/error-handler.js";
import { sessionForToken } from "./auth.service.js";

export const ADMIN_COOKIE_NAME = "qleaves_admin";

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(pair.slice(separator + 1).trim());
  }

  return null;
}

export const requireAdmin: RequestHandler = async (request, response, next) => {
  try {
    const token = readCookie(request.headers.cookie, ADMIN_COOKIE_NAME);
    const admin = await sessionForToken(token);
    if (!admin) {
      throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
    }
    response.locals.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
};
