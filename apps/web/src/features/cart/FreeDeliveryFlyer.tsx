import { useLayoutEffect, useRef } from "react";
import { useFreeDeliveryStore, FREE_DELIVERY_TIMINGS } from "./free-delivery-store";

// The line's own colours on the card, and the warm gold it takes on as it joins the dark cart icon.
const FROM = [63, 91, 67];
const TO = [215, 197, 138];
const RING_GAP_PX = 5;
const RING_STROKE_PX = 2;
const LINE_HEIGHT_PX = 8;

const ease = (value: number) => (value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const tint = (amount: number, alpha = 1) => `rgba(${FROM.map((from, index) => Math.round(mix(from, TO[index], amount))).join(",")},${alpha})`;

// The cart icon the line should join: the floating cart button where it is on screen, otherwise the
// one in the header.
function findTarget(): HTMLElement | null {
  const candidates = [...document.querySelectorAll<HTMLElement>("[data-fd-target]")];
  const visible = (element: HTMLElement) => element.getBoundingClientRect().width > 0;
  return candidates.find((element) => element.dataset.fdTarget === "floating" && visible(element))
    ?? candidates.find((element) => element.dataset.fdTarget === "header" && visible(element))
    ?? null;
}

// Draws the finished line leaving the banner and opening into a ring around the cart icon. It follows
// the icon's live position every frame, so scrolling during the flight cannot make it miss. The ring it
// ends on is the one the icon itself then keeps (see the data-fd-ring styles).
export function FreeDeliveryFlyer() {
  const phase = useFreeDeliveryStore((state) => state.phase);
  const setPhase = useFreeDeliveryStore((state) => state.setPhase);
  const element = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (phase !== "fly") return;
    const flyer = element.current;
    const track = document.querySelector<HTMLElement>("[data-fd-track]");
    const first = track?.getBoundingClientRect();
    if (!flyer || !first || first.width === 0 || !findTarget()) {
      setPhase("done");
      return;
    }

    const start = { cx: first.left + first.width / 2, cy: first.top + first.height / 2, width: first.width };
    const began = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const target = findTarget();
      if (!target) { setPhase("done"); return; }
      const progress = clamp01((now - began) / FREE_DELIVERY_TIMINGS.flyMs);
      const box = target.getBoundingClientRect();
      const ring = { cx: box.left + box.width / 2, cy: box.top + box.height / 2, width: box.width + RING_GAP_PX * 2, height: box.height + RING_GAP_PX * 2 };

      // First the line glides over and narrows to the icon's width, then it opens up into the ring.
      const travel = ease(clamp01(progress / 0.58));
      const open = ease(clamp01((progress - 0.5) / 0.5));
      const width = mix(start.width, ring.width, travel);
      const height = mix(LINE_HEIGHT_PX, ring.height, open);
      flyer.style.width = `${width}px`;
      flyer.style.height = `${height}px`;
      flyer.style.transform = `translate(${mix(start.cx, ring.cx, travel) - width / 2}px, ${mix(start.cy, ring.cy, travel) - height / 2}px)`;
      flyer.style.borderColor = tint(open);
      flyer.style.background = tint(travel, 1 - open);
      flyer.style.boxShadow = `0 0 ${Math.round(mix(6, 14, open))}px ${Math.round(mix(1, 2, open))}px ${tint(1, mix(0.35, 0.6, open))}`;
      flyer.style.opacity = "1";

      if (progress >= 1) { setPhase("done"); return; }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [phase, setPhase]);

  if (phase !== "fly") return null;
  return <div ref={element} className="free-delivery-flyer" style={{ borderWidth: RING_STROKE_PX, opacity: 0 }} aria-hidden="true" data-testid="free-delivery-flyer" />;
}
