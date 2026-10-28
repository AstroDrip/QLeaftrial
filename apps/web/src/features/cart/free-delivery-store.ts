import { useEffect, useRef } from "react";
import { create } from "zustand";
import { cartSubtotal, useCartStore } from "./cart-store";

// Orders of this size or more are delivered free. Smaller orders can still be placed.
export const FREE_DELIVERY_THRESHOLD_QAR = 150;

// progress  - below the goal, the banner fills as the basket grows
// celebrate - the goal was just reached: the message holds still so it can be read
// collapse  - text and anchors fade and the card closes in around the line
// fly       - the line travels to the cart icon and opens into a ring around it
// done      - the banner is gone; the cart icon keeps the ring while the goal is met
export type FreeDeliveryPhase = "progress" | "celebrate" | "collapse" | "fly" | "done";

// The message holds still just long enough to read; the moves after it are quick and eased.
export const FREE_DELIVERY_TIMINGS = { celebrateMs: 1100, collapseMs: 550, flyMs: 500, flyFallbackMs: 1500 } as const;

type FreeDeliveryState = { phase: FreeDeliveryPhase; setPhase: (phase: FreeDeliveryPhase) => void };

// A basket that already met the goal when the site opened starts "done": no banner, just the ring.
const startsUnlocked = cartSubtotal(useCartStore.getState().items) >= FREE_DELIVERY_THRESHOLD_QAR;

export const useFreeDeliveryStore = create<FreeDeliveryState>((set) => ({
  phase: startsUnlocked ? "done" : "progress",
  setPhase: (phase) => set({ phase }),
}));

export function freeDeliveryProgress(subtotalQar: number) {
  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD_QAR - subtotalQar);
  const percent = Math.min(100, Math.max(0, Math.round((subtotalQar / FREE_DELIVERY_THRESHOLD_QAR) * 100)));
  return { remaining, percent, unlocked: remaining === 0 };
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

// Mounted once in the site header, which is on every page, so the sequence keeps running when the
// shopper navigates mid-animation. A basket that already met the goal when the site opened shows
// the ring straight away instead of replaying the celebration.
export function useFreeDeliveryController(): void {
  const subtotal = useCartStore((state) => cartSubtotal(state.items));
  const unlocked = subtotal >= FREE_DELIVERY_THRESHOLD_QAR;
  const phase = useFreeDeliveryStore((state) => state.phase);
  const setPhase = useFreeDeliveryStore((state) => state.setPhase);
  const seen = useRef(false);

  useEffect(() => {
    const current = useFreeDeliveryStore.getState().phase;
    if (!unlocked) {
      seen.current = true;
      if (current !== "progress") setPhase("progress");
      return;
    }
    if (!seen.current) {
      seen.current = true;
      if (current === "progress") setPhase("done");
      return;
    }
    if (current === "progress") setPhase("celebrate");
  }, [unlocked, setPhase]);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (phase === "celebrate") timer = setTimeout(() => setPhase(reduced ? "done" : "collapse"), FREE_DELIVERY_TIMINGS.celebrateMs);
    else if (phase === "collapse") timer = setTimeout(() => setPhase("fly"), FREE_DELIVERY_TIMINGS.collapseMs);
    // The flyer ends the flight itself; this only rescues a flight that could not start.
    else if (phase === "fly") timer = setTimeout(() => setPhase("done"), FREE_DELIVERY_TIMINGS.flyFallbackMs);
    return () => clearTimeout(timer);
  }, [phase, setPhase]);
}

// True while the basket meets the goal and the banner has finished its goodbye.
export function useFreeDeliveryRing(): boolean {
  const unlocked = useCartStore((state) => cartSubtotal(state.items)) >= FREE_DELIVERY_THRESHOLD_QAR;
  const done = useFreeDeliveryStore((state) => state.phase === "done");
  return unlocked && done;
}
