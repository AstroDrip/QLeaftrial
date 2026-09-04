import { Router } from "express";
import { ApiError } from "../../middleware/error-handler.js";
import { ADMIN_COOKIE_NAME, readCookie, requireAdmin } from "./auth.middleware.js";
import { authenticatePassword, deleteSession } from "./auth.service.js";
import { loginSchema } from "./auth.schemas.js";
import { clearLoginAttempts, isLoginLimited, recordLoginFailure } from "./login-rate-limit.js";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function cookie(value: string, maxAge = SESSION_MAX_AGE_SECONDS): string {
  return [
    `${ADMIN_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

export const authRouter = Router();

authRouter.post("/auth/login", async (request, response) => {
  const clientKey = request.ip || request.socket.remoteAddress || "unknown";
  if (isLoginLimited(clientKey)) {
    response.setHeader("Retry-After", String(15 * 60));
    throw new ApiError(429, "TOO_MANY_LOGIN_ATTEMPTS", "Too many login attempts. Try again later");
  }
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "A password is required");
  }

  const result = await authenticatePassword(parsed.data.password);
  if (!result) {
    recordLoginFailure(clientKey);
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  clearLoginAttempts(clientKey);
  response.setHeader("Set-Cookie", cookie(result.token));
  response.json({ authenticated: true, admin: result.admin });
});

authRouter.get("/auth/session", requireAdmin, (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ authenticated: true, admin: response.locals.admin });
});

authRouter.post("/auth/logout", async (request, response) => {
  const token = readCookie(request.headers.cookie, ADMIN_COOKIE_NAME);
  await deleteSession(token);
  response.setHeader("Set-Cookie", cookie("", 0));
  response.status(204).end();
});
