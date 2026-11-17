import { useEffect, useRef, type RefObject } from "react";

// One timer for every slideshow on the page. Each slideshow registers only while it is on screen (and the visitor
// has not asked for reduced motion); the timer runs only while something is registered and the tab is visible.
// Slideshows are given different starting delays so a row of cards never changes all at once.
type Subscriber = { due: number; period: number; advance: () => void };

const subscribers = new Set<Subscriber>();
const TICK_MS = 200;
let timer: ReturnType<typeof setInterval> | null = null;

function run() {
  if (typeof document !== "undefined" && document.hidden) return;
  const now = performance.now();
  for (const subscriber of subscribers) {
    if (now < subscriber.due) continue;
    subscriber.due = now + subscriber.period;
    subscriber.advance();
  }
}

function sync() {
  if (subscribers.size && !timer) timer = setInterval(run, TICK_MS);
  if (!subscribers.size && timer) { clearInterval(timer); timer = null; }
}

if (typeof document !== "undefined") {
  // Back from another tab: start counting again rather than changing every slideshow at the same moment.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const now = performance.now();
    for (const subscriber of subscribers) subscriber.due = now + subscriber.period * (0.5 + Math.random() * 0.5);
  });
}

/** For tests: how many slideshows are currently registered with the shared timer. */
export function activeSlideshowCount(): number {
  return subscribers.size;
}

/**
 * Calls `advance` every `periodMs` while `enabled`, the element is at least `threshold` visible and the tab is
 * visible. The first change comes after a staggered delay.
 */
export function useAutoAdvance(
  element: RefObject<Element | null>,
  { enabled, periodMs, threshold = 0.6, advance }: { enabled: boolean; periodMs: number; threshold?: number; advance: () => void },
) {
  const latest = useRef(advance);
  latest.current = advance;

  useEffect(() => {
    const target = element.current;
    if (!enabled || !target) return;
    const subscriber: Subscriber = { due: 0, period: periodMs, advance: () => latest.current() };
    const join = () => {
      if (subscribers.has(subscriber)) return;
      subscriber.due = performance.now() + periodMs * (0.6 + Math.random() * 0.6);
      subscribers.add(subscriber);
      sync();
    };
    const leave = () => { subscribers.delete(subscriber); sync(); };
    if (typeof IntersectionObserver === "undefined") {
      join();
      return leave;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= threshold) join();
      else leave();
    }, { threshold: [0, threshold] });
    observer.observe(target);
    return () => { observer.disconnect(); leave(); };
  }, [element, enabled, periodMs, threshold]);
}
