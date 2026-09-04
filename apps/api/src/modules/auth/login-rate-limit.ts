const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_TRACKED_CLIENTS = 10_000;

type AttemptWindow = { failures: number; startedAt: number };
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

function current(key: string, now = Date.now()): AttemptWindow {
  pruneExpired(now);
  const existing = attempts.get(key);
  if (!existing || now - existing.startedAt >= WINDOW_MS) {
    const fresh = { failures: 0, startedAt: now };
    attempts.set(key, fresh);
    return fresh;
  }
  return existing;
}

export function isLoginLimited(key: string): boolean {
  return current(key).failures >= MAX_FAILURES;
}

export function recordLoginFailure(key: string): void {
  current(key).failures += 1;
}

export function clearLoginAttempts(key?: string): void {
  if (key) attempts.delete(key);
  else attempts.clear();
}
