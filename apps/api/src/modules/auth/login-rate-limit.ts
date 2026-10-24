import {
  clearRateLimit,
  consumeRateLimit,
  inspectRateLimit,
  type RateLimitDecision,
} from "../../lib/rate-limit.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const LIMITER = "admin-login";

export async function isLoginLimited(key: string): Promise<boolean> {
  return (await inspectRateLimit({
    limiter: LIMITER,
    clientKey: key,
    limit: MAX_FAILURES,
    windowMs: WINDOW_MS,
  })).limited;
}

export function recordLoginFailure(key: string): Promise<RateLimitDecision> {
  return consumeRateLimit({ limiter: LIMITER, clientKey: key, limit: MAX_FAILURES, windowMs: WINDOW_MS });
}

export function clearLoginAttempts(key?: string): Promise<void> {
  return clearRateLimit(LIMITER, key);
}
