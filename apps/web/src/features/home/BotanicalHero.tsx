import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { prefetchRoute } from "../../app/route-modules";
import "./botanical-hero.css";
import {
  CLUSTER_HEIGHT,
  CLUSTER_WIDTH,
  LEFT_CLUSTER,
  RIGHT_CLUSTER,
  cssColor,
  drawOrder,
  leafPath,
  midribPath,
  type Leaf,
} from "./botanical-leaves";

// The home page hero: a headline and a Shop now button between two groups of plants.
//
// The plants are inline SVG, so the whole hero is complete in the first paint with nothing to download.
// After the page has settled, and only on capable devices that allow motion, a small WebGL scene with the
// very same leaves fades in over them and lets them sway. Anything going wrong (no WebGL, a lost GPU
// context, reduced motion, data saver, a weak device) simply leaves the still picture in place.
// The plants live in their own grid cells beside (or below) the text, so they never cover it.

type Copy = { eyebrow: string; title: string; lead: string; cta: string };

function Cluster({ leaves, mirror }: { leaves: Leaf[]; mirror: boolean }) {
  return (
    <svg
      className="botanical-hero__plants-art"
      viewBox={`0 0 ${CLUSTER_WIDTH} ${CLUSTER_HEIGHT}`}
      preserveAspectRatio={mirror ? "xMaxYMax meet" : "xMinYMax meet"}
      aria-hidden="true"
      focusable="false"
    >
      {drawOrder(leaves).map((leaf, index) => (
        <g key={index}>
          <path d={leafPath(leaf, mirror)} fill={cssColor(leaf.color, leaf.depth)} />
          <path d={midribPath(leaf, mirror)} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth={Math.max(1.4, leaf.width * 0.035)} strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

function motionWelcome(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if ((nav.hardwareConcurrency ?? 4) <= 2 || (nav.deviceMemory ?? 4) <= 2) return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    return false;
  }
}

export function BotanicalHero({ copy }: { copy: Copy }) {
  const hero = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!motionWelcome()) return;
    let disposed = false;
    let scene: { dispose: () => void } | null = null;
    const schedule = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 400));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = schedule(() => {
      void import("./botanical-scene").then(({ startBotanicalScene }) => {
        if (disposed || !canvas.current) return;
        scene = startBotanicalScene({
          canvas: canvas.current,
          cells: () => {
            const area = hero.current?.getBoundingClientRect();
            // The SVG boxes, so the moving leaves land exactly on the still ones.
            const a = left.current?.firstElementChild?.getBoundingClientRect();
            const b = right.current?.firstElementChild?.getBoundingClientRect();
            if (!area || !a || !b) return null;
            const local = (box: DOMRect) => ({ left: box.left - area.left, top: box.top - area.top, width: box.width, height: box.height });
            return { left: local(a), right: local(b) };
          },
          onLost: () => {
            scene?.dispose();
            scene = null;
            setLive(false);
          },
        });
        if (scene) setLive(true);
      }).catch(() => undefined);
    });
    return () => {
      disposed = true;
      cancel(handle);
      scene?.dispose();
    };
  }, []);

  return (
    <section ref={hero} className={`botanical-hero${live ? " is-live" : ""}`} aria-labelledby="hero-heading">
      <canvas ref={canvas} className="botanical-hero__canvas" aria-hidden="true" />
      <div ref={left} className="botanical-hero__plants botanical-hero__plants--left" aria-hidden="true">
        <Cluster leaves={LEFT_CLUSTER} mirror={false} />
      </div>
      <div className="botanical-hero__copy">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 id="hero-heading">{copy.title}</h1>
        <p className="botanical-hero__lead">{copy.lead}</p>
        <div className="botanical-hero__actions">
          <Link to="/shop" className="button botanical-hero__cta" onMouseEnter={() => prefetchRoute("/shop")} onFocus={() => prefetchRoute("/shop")}>{copy.cta}</Link>
        </div>
      </div>
      <div ref={right} className="botanical-hero__plants botanical-hero__plants--right" aria-hidden="true">
        <Cluster leaves={RIGHT_CLUSTER} mirror />
      </div>
    </section>
  );
}
