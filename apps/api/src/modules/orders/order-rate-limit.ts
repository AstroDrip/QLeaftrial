import type { RequestHandler } from "express";
import { ApiError } from "../../middleware/error-handler.js";
import { clearRateLimit, consumeRateLimit } from "../../lib/rate-limit.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
type AttemptResult = { limited: boolean; retryAfterSeconds: number };
const LIMITER = "public-order";

export function consumeOrderAttempt(key: string, now = Date.now()): Promise<AttemptResult> {
  return consumeRateLimit({ limiter: LIMITER, clientKey: key, limit: MAX_ATTEMPTS, windowMs: WINDOW_MS, now });
}

export function clearOrderRateLimit(key?: string): Promise<void> {
  return clearRateLimit(LIMITER, key);
}

export const publicOrderRateLimit: RequestHandler = async (request, response, next) => {
  const key = request.ip || request.socket.remoteAddress || "unknown";
  let result: AttemptResult;
  try {
    result = await consumeOrderAttempt(key);
  } catch {
    next(new ApiError(503, "RATE_LIMIT_UNAVAILABLE", "Order service is temporarily unavailable"));
    return;
  }

  if (!result.limited) {
    next();
    return;
  }

  response.setHeader("Retry-After", String(result.retryAfterSeconds));
  response.status(429).json({
    error: {
      code: "TOO_MANY_ORDER_ATTEMPTS",
      message: "Too many order attempts. Please try again later.",
    },
  });
};
