import type { RequestHandler } from "express";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const MAX_TRACKED_CLIENTS = 10_000;

type AttemptWindow = { attempts: number; startedAt: number };
type AttemptResult = { limited: boolean; retryAfterSeconds: number };

const attempts = new Map<string, AttemptWindow>();

function pruneExpired(now: number): void {
  for (const [key, attempt] of attempts) {
    if (now - attempt.startedAt >= WINDOW_MS) attempts.delete(key);
  }

  while (attempts.size >= MAX_TRACKED_CLIENTS) {
    const oldestKey = attempts.keys().next().value as string | undefined;
    if (!oldestKey) break;
    attempts.delete(oldestKey);
  }
}

export function consumeOrderAttempt(key: string, now = Date.now()): AttemptResult {
  pruneExpired(now);
  const existing = attempts.get(key);
  const window = !existing || now - existing.startedAt >= WINDOW_MS
    ? { attempts: 0, startedAt: now }
    : existing;

  if (!existing || window !== existing) attempts.set(key, window);

  const elapsed = now - window.startedAt;
  const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000));

  if (window.attempts >= MAX_ATTEMPTS) {
    return { limited: true, retryAfterSeconds };
  }

  window.attempts += 1;
  return { limited: false, retryAfterSeconds };
}

export function clearOrderRateLimit(key?: string): void {
  if (key) attempts.delete(key);
  else attempts.clear();
}

export const publicOrderRateLimit: RequestHandler = (request, response, next) => {
  const key = request.ip || request.socket.remoteAddress || "unknown";
  const result = consumeOrderAttempt(key);

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
