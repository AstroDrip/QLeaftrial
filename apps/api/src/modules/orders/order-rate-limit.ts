import { clearRateLimit, consumeRateLimit } from "../../lib/rate-limit.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
type AttemptResult = { limited: boolean; retryAfterSeconds: number };
const LIMITER = "public-order";

export function consumeOrderAttempt(key: string, now = Date.now()): Promise<AttemptResult> {
  return consumeRateLimit({ limiter: LIMITER, clientKey: key, limit: MAX_ATTEMPTS, windowMs: WINDOW_MS, now });
}

// Asking again for an order that already exists (same key) is cheap and must not lock a customer out of their own
// confirmation, so it has its own, larger budget.
const REPLAY_LIMITER = "public-order-replay";
const MAX_REPLAYS = 120;

export function consumeOrderReplay(key: string, now = Date.now()): Promise<AttemptResult> {
  return consumeRateLimit({ limiter: REPLAY_LIMITER, clientKey: key, limit: MAX_REPLAYS, windowMs: WINDOW_MS, now });
}

export async function clearOrderRateLimit(key?: string): Promise<void> {
  await clearRateLimit(LIMITER, key);
  await clearRateLimit(REPLAY_LIMITER, key);
}
