import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { prefetchRoute } from "../../app/route-modules";
import "./botanical-hero.css";

// The home page hero: a headline and a Shop now button between two groups of real plants.
//
// The plants are cut-outs of the shop's own studio photographs (scripts/catalogue/hero_cutouts.py), standing
// on a warm plaster wall and stone floor. Each keeps its soft studio contact shadow, and a cast shadow
// falls away from the daylight on the upper right; the further back a plant is, the softer its shadow.
// The plant groups are grid cells of their own beside (or, on narrow screens, below) the text, so they
// never cover the headline or the button.
//
// Motion (Anime.js, loaded after the page is idle): the plants shift a few pixels with the mouse, nearer
// plants more than farther ones, for a gentle sense of depth. There is no entry animation: the photos are
// already on screen by the time the library arrives, and hiding them to replay an entrance looked like a
// flicker. Nothing runs continuously, nothing moves on touch screens or for reduced motion.

type Copy = { eyebrow: string; title: string; lead: string; cta: string };
type Depth = "rear" | "mid" | "front";
type Plant = { src: string; width: number; height: number; depth: Depth; x: number; bottom: number; size: number };

// x: distance from the hero's outer edge, bottom: lift above the floor, size: height. All in % of the cell.
export const LEFT_PLANTS: Plant[] = [
  { src: "areca", width: 557, height: 893, depth: "rear", x: 2, bottom: 14, size: 80 },
  { src: "dracaena-compacta", width: 427, height: 760, depth: "mid", x: 38, bottom: 9, size: 62 },
  { src: "bird-nest", width: 682, height: 460, depth: "front", x: -6, bottom: 0, size: 30 },
  { src: "orbifolia", width: 655, height: 560, depth: "front", x: 40, bottom: 0, size: 32 },
];
export const RIGHT_PLANTS: Plant[] = [
  { src: "marginata", width: 541, height: 900, depth: "rear", x: 4, bottom: 14, size: 82 },
  { src: "prince-orange", width: 538, height: 520, depth: "mid", x: 40, bottom: 7, size: 36 },
  { src: "rosso", width: 436, height: 420, depth: "front", x: 2, bottom: 0, size: 26 },
];

// Pixels each layer may travel at the pointer's furthest reach.
const PARALLAX: Record<Depth, number> = { rear: 4, mid: 8, front: 13 };

function PlantGroup({ side, plants }: { side: "left" | "right"; plants: Plant[] }) {
  return (
    <div className={`botanical-hero__plants botanical-hero__plants--${side}`} aria-hidden="true">
      {plants.map((plant) => (
        <img
          key={plant.src}
          className={`botanical-hero__plant botanical-hero__plant--${plant.depth}`}
          data-depth={plant.depth}
          src={`/media/hero/${plant.src}.webp`}
          width={plant.width}
          height={plant.height}
          alt=""
          decoding="async"
          // The nearest plants are part of the first view; the farther ones may arrive a moment later.
          fetchPriority={plant.depth === "front" ? "high" : "auto"}
          style={{ "--x": `${plant.x}%`, "--b": `${plant.bottom}%`, "--h": `${plant.size}%` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function BotanicalHero({ copy }: { copy: Copy }) {
  const hero = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = hero.current;
    if (!root || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;
    if (!finePointer) return;
    let disposed = false;
    let cleanup: () => void = () => undefined;
    const schedule = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = schedule(() => {
      void import("animejs").then(({ animate }) => {
        if (disposed) return;
        const plants = Array.from(root.querySelectorAll<HTMLElement>(".botanical-hero__plant"));
        let frame = 0;
        let target = { x: 0, y: 0 };
        const move = () => {
          frame = 0;
          for (const plant of plants) {
            const reach = PARALLAX[(plant.dataset.depth as Depth) ?? "mid"];
            animate(plant, { x: target.x * reach, y: target.y * reach * 0.5, duration: 1100, ease: "outQuart" });
          }
        };
        const onPointer = (event: PointerEvent) => {
          if (event.pointerType !== "mouse") return;
          const box = root.getBoundingClientRect();
          if (box.bottom < 0 || box.top > window.innerHeight) return;
          const clamp = (value: number) => Math.max(-1, Math.min(1, value));
          target = { x: clamp((event.clientX / window.innerWidth - 0.5) * -2), y: clamp(((event.clientY - box.top) / box.height - 0.5) * -2) };
          if (!frame) frame = requestAnimationFrame(move);
        };
        window.addEventListener("pointermove", onPointer, { passive: true });
        cleanup = () => {
          window.removeEventListener("pointermove", onPointer);
          cancelAnimationFrame(frame);
          for (const plant of plants) plant.style.transform = "";
        };
      }).catch(() => undefined);
    });
    return () => {
      disposed = true;
      cancel(handle);
      cleanup();
    };
  }, []);

  return (
    <section ref={hero} className="botanical-hero" aria-labelledby="hero-heading">
      <PlantGroup side="left" plants={LEFT_PLANTS} />
      <div className="botanical-hero__copy">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 id="hero-heading">{copy.title}</h1>
        <p className="botanical-hero__lead">{copy.lead}</p>
        <div className="botanical-hero__actions">
          <Link to="/shop" className="button botanical-hero__cta" onMouseEnter={() => prefetchRoute("/shop")} onFocus={() => prefetchRoute("/shop")}>{copy.cta}</Link>
        </div>
      </div>
      <PlantGroup side="right" plants={RIGHT_PLANTS} />
    </section>
  );
}
