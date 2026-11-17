// One number per browsing session, renewed each day, that decides which products the homepage shelves show and
// which photograph each card starts on. Kept in sessionStorage (this tab only, gone when it closes); when storage
// is blocked it lives in memory for the page's lifetime. Nothing personal is stored.
const KEY = "qleaves-home-seed";
let memory: { day: string; seed: number } | undefined;

const localDay = (now: Date) => `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

function freshSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 4_294_967_296);
  }
}

export function sessionSeed(now = new Date()): number {
  const day = localDay(now);
  if (memory?.day === day) return memory.seed;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { day?: unknown; seed?: unknown } | null;
    if (saved && saved.day === day && typeof saved.seed === "number" && Number.isInteger(saved.seed)) {
      memory = { day, seed: saved.seed >>> 0 };
      return memory.seed;
    }
  } catch {
    // Unreadable or blocked storage: a new seed below.
  }
  memory = { day, seed: freshSeed() };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Storage blocked: the seed still holds for this page.
  }
  return memory.seed;
}

/** For tests: forget the seed, or fix it. */
export function resetHomeSeedForTests(seed?: number, now = new Date()): void {
  memory = seed === undefined ? undefined : { day: localDay(now), seed };
}
