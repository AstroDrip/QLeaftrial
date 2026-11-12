import { useEffect, useRef } from "react";
import { create } from "zustand";
import { cartSubtotal, useCartStore } from "./cart-store";

// Orders of this size or more are delivered free. Smaller orders can still be placed.
export const FREE_DELIVERY_THRESHOLD_QAR = 150;

// progress  - below the goal, the banner fills as the basket grows
// celebrate - the goal was just reached: the light arrives and the finished line fills (about three quarters of a second)
// collapse  - text and anchors fade and the card closes in around the line
// fly       - the line travels to the cart icon, wraps round it, holds a beat and fades away
// done      - the banner and the line are gone; nothing is left on screen
export type FreeDeliveryPhase = "progress" | "celebrate" | "collapse" | "fly" | "done";

// The light eases into the finish (500ms) and its glow runs back along the line (450ms, so the line is filled at
// 950ms). The card starts closing at 750ms, while that last stretch of glow is still running, and the line wraps
// the cart button straight after the 450ms close-in, with no pause in between.
export const FREE_DELIVERY_TIMINGS = { celebrateMs: 750, collapseMs: 450, flyMs: 500, ringHoldMs: 200, ringFadeMs: 450, flyFallbackMs: 2200 } as const;

type FreeDeliveryState = { phase: FreeDeliveryPhase; setPhase: (phase: FreeDeliveryPhase) => void };

// A basket that already met the goal when the site opened starts "done": no banner, nothing to replay.
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
