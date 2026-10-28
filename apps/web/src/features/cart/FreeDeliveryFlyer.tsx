import { useLayoutEffect, useRef } from "react";
import { useFreeDeliveryStore, FREE_DELIVERY_TIMINGS } from "./free-delivery-store";

// The line is the finished track's yellow gold and keeps it, glow and all, all the way round the cart
// button; the colour and the glow come from the stylesheet (.free-delivery-flyer).
// The ring sits 5px outside the cart button with a 1.5px stroke, so the stroke's centre is 4.25px out.
const RING_OUTSET_PX = 4.25;
const RING_STROKE_PX = 1.5;
const SAMPLES = 40;

const ease = (value: number) => (value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;

type Point = { x: number; y: number };
type Box = { left: number; top: number; width: number; height: number };

// The floating cart button, when it is on screen. On the cart and checkout pages it is not, and the
// line simply draws itself back in.
function findTarget(): HTMLElement | null {
  const target = document.querySelector<HTMLElement>("[data-fd-target='floating']");
  return target && target.getBoundingClientRect().width > 0 ? target : null;
}

// A point on the LEFT half of a stadium (pill) outline, `distance` along it from the top middle, going
// left, down around the cap and along the bottom to the bottom middle. The right half is its mirror image.
export function outlinePoint(box: Box, distance: number): Point {
  const radius = Math.min(box.width, box.height) / 2;
  const middle = box.left + box.width / 2;
  const straight = Math.max(0, box.width / 2 - radius);
  if (distance <= straight) return { x: middle - distance, y: box.top };
  const afterTop = distance - straight;
  const cap = Math.PI * radius;
  if (afterTop <= cap) {
    const angle = afterTop / radius;
    return { x: middle - straight - radius * Math.sin(angle), y: box.top + radius - radius * Math.cos(angle) };
  }
  return { x: middle - straight + (afterTop - cap), y: box.top + 2 * radius };
}

export function outlineHalfLength(box: Box): number {
  const radius = Math.min(box.width, box.height) / 2;
  return 2 * Math.max(0, box.width / 2 - radius) + Math.PI * radius;
}

// Both halves of a line, each `halfLength` long, laid out by `place(distance)` for the left half (the
// right half mirrors it around x = middle), joined into one polyline from the left end to the right end.
function joined(middle: number, halfLength: number, place: (distance: number) => Point): string {
  const left: Point[] = [];
  for (let step = SAMPLES; step >= 0; step -= 1) left.push(place((halfLength * step) / SAMPLES));
  const right = left.slice(0, -1).reverse().map((point) => ({ x: 2 * middle - point.x, y: point.y }));
  return [...left, ...right].map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

// Draws the finished line leaving the banner. Above the floating cart button it slides down onto the
// button's top edge, then both ends bend away like curves, down around the sides, until they meet at
// the bottom middle: the line has become a ring around the button. It holds there for a beat and fades
// away, leaving nothing behind. Everywhere else the line simply draws itself back in. The button's live
// position is read every frame, so scrolling cannot make it miss.
export function FreeDeliveryFlyer() {
  const phase = useFreeDeliveryStore((state) => state.phase);
  const setPhase = useFreeDeliveryStore((state) => state.setPhase);
  const path = useRef<SVGPathElement>(null);

  useLayoutEffect(() => {
    if (phase !== "fly") return;
    const line = path.current;
    const track = document.querySelector<HTMLElement>("[data-fd-track]");
    const first = track?.getBoundingClientRect();
    if (!line || !first || first.width === 0) {
      setPhase("done");
      return;
    }

    const start = { cx: first.left + first.width / 2, cy: first.top + first.height / 2, half: first.width / 2, thickness: first.height };
    const began = performance.now();
    let frame = 0;

    const { flyMs, ringHoldMs, ringFadeMs } = FREE_DELIVERY_TIMINGS;
    const draw = (now: number) => {
      const elapsed = now - began;
      const progress = clamp01(elapsed / flyMs);
      const target = findTarget();

      if (!target) {
        // Nothing to circle: the line draws itself back in towards its middle and fades.
        const retract = ease(progress);
        line.setAttribute("d", joined(start.cx, start.half * (1 - retract), (distance) => ({ x: start.cx - distance, y: start.cy })));
        line.setAttribute("stroke-width", String(start.thickness));
        line.setAttribute("opacity", String(1 - retract));
      } else {
        const rect = target.getBoundingClientRect();
        const ring: Box = { left: rect.left - RING_OUTSET_PX, top: rect.top - RING_OUTSET_PX, width: rect.width + RING_OUTSET_PX * 2, height: rect.height + RING_OUTSET_PX * 2 };
        const ringMiddle = ring.left + ring.width / 2;
        const topHalf = Math.max(0, ring.width / 2 - Math.min(ring.width, ring.height) / 2);
        const fullHalf = outlineHalfLength(ring);

        // First the line glides onto the button's top edge, narrowing to that edge's length...
        const glide = ease(clamp01(progress / 0.45));
        // ...then both ends bend away along the outline until they meet underneath.
        const wrap = ease(clamp01((progress - 0.45) / 0.55));
        const thickness = mix(start.thickness, RING_STROKE_PX, glide);
        line.setAttribute("stroke-width", String(thickness));
        // Once the ends have met the ring holds for a beat, then fades away and is gone.
        line.setAttribute("opacity", String(1 - ease(clamp01((elapsed - flyMs - ringHoldMs) / ringFadeMs))));
        if (wrap === 0) {
          const middle = mix(start.cx, ringMiddle, glide);
          const y = mix(start.cy, ring.top, glide);
          line.setAttribute("d", joined(middle, mix(start.half, topHalf, glide), (distance) => ({ x: middle - distance, y })));
        } else {
          line.setAttribute("d", joined(ringMiddle, mix(topHalf, fullHalf, wrap), (distance) => outlinePoint(ring, distance)));
        }
      }

      if (elapsed >= (target ? flyMs + ringHoldMs + ringFadeMs : flyMs)) { setPhase("done"); return; }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [phase, setPhase]);

  if (phase !== "fly") return null;
  return (
    <svg className="free-delivery-flyer" aria-hidden="true" focusable="false" data-testid="free-delivery-flyer">
      <path ref={path} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0" />
    </svg>
  );
}
