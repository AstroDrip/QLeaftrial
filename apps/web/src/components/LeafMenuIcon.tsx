import { useEffect, useRef } from "react";

// The QLeaves leaf emblem, redrawn as its own strokes (outline, stem, branch, and the diagonal that is
// both a vein and the tail of the Q) from the brand artwork, so each part can move on its own.
//
// It is still most of the time. Every few seconds, at irregular moments, a breath of air reaches it: the
// leaf swings a little from its tail, the tip flicks and the veins lag behind, then it settles. Opening
// the menu turns it slightly toward the light; closing lets it fall back. One small spring simulation
// drives everything and only runs while something is actually moving.

type Command = [string, number[]];

// Centre line of the outline (stroke 6.78 in these units), tip at the top. Matches the artwork's filled
// outline to within a fraction of a pixel at header size.
const OUTLINE: Command[] = [
  ["M", [44.8, 128.53]], ["L", [41.11, 128.51]],
  ["C", [31.66, 127.68, 22.34, 123.36, 15.55, 116.57]], ["C", [7.9, 108.92, 3.44, 98.15, 3.44, 87.34]],
  ["C", [3.44, 83.35, 3.85, 79.22, 4.55, 75.31]], ["L", [6.38, 67.36]],
  ["C", [7.99, 61.65, 10.12, 56.17, 12.46, 51.12]], ["L", [15.67, 44.63]],
  ["C", [18.42, 39.43, 21.33, 34.68, 24.04, 30.61]], ["C", [31.28, 19.74, 40.15, 9.77, 44.8, 4.79]],
  ["C", [49.45, 9.77, 58.32, 19.74, 65.56, 30.61]], ["C", [68.27, 34.68, 71.18, 39.43, 73.89, 44.55]],
  ["L", [77.1, 51.04]], ["C", [79.48, 56.17, 81.61, 61.65, 83.17, 67.2]], ["L", [85.02, 75.14]],
  ["C", [85.75, 79.22, 86.16, 83.35, 86.16, 87.34]], ["C", [86.16, 98.15, 81.7, 108.92, 74.05, 116.57]],
  ["C", [67.26, 123.36, 57.94, 127.68, 48.49, 128.51]], ["Z", []],
];
const WIDEST_Y = 87.34;
const TIP_Y = 4.79;
// The leaf swings from where it would hang on a twig (the end of the Q's tail); the veins turn about the
// point where they meet.
const HANG = [80, 124] as const;
const JOIN = [44.8, 95.71] as const;

// Bends only the upper part of the outline: nothing below the widest point moves, the tip moves most.
function outline(tip: number): string {
  return OUTLINE.map(([command, values]) => {
    if (!values.length) return command;
    const moved = values.map((value, index) => {
      if (index % 2 === 1) return value;
      const y = values[index + 1];
      const weight = y < WIDEST_Y ? ((WIDEST_Y - y) / (WIDEST_Y - TIP_Y)) ** 1.6 : 0;
      return value + tip * weight;
    });
    return command + moved.map((value) => Math.round(value * 100) / 100).join(" ");
  }).join("");
}

type Pose = { lean: number; tip: number; veins: number };
const REST: Pose = { lean: 0, tip: 0, veins: 0 };
const OPEN: Pose = { lean: -7, tip: -2.2, veins: 6 };
// Under-damped on purpose (damping ratio about 0.42): a flick, one small overshoot, then rest.
const STIFFNESS = 170;
const DAMPING = 11;
const KEYS = ["lean", "tip", "veins"] as const;

const random = (min: number, max: number) => min + Math.random() * (max - min);
const sign = () => (Math.random() < 0.5 ? -1 : 1);

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export function LeafMenuIcon({ open }: { open: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const whole = useRef<SVGGElement>(null);
  const veins = useRef<SVGGElement>(null);
  const edge = useRef<SVGPathElement>(null);
  const motion = useRef<{
    position: Pose; velocity: Pose; target: Pose; frame: number; last: number; apply: () => void; start: () => void;
  } | null>(null);

  // One spring per part, shared by the idle twitches and the open/close response.
  useEffect(() => {
    const state = {
      position: { ...REST }, velocity: { ...REST }, target: { ...REST }, frame: 0, last: 0,
      apply() {
        whole.current?.setAttribute("transform", `rotate(${state.position.lean.toFixed(3)} ${HANG[0]} ${HANG[1]})`);
        veins.current?.setAttribute("transform", `rotate(${state.position.veins.toFixed(3)} ${JOIN[0]} ${JOIN[1]})`);
        edge.current?.setAttribute("d", outline(state.position.tip));
      },
      start() {
        if (!state.frame) { state.last = 0; state.frame = requestAnimationFrame(step); }
      },
    };
    const step = (time: number) => {
      const dt = state.last ? Math.min((time - state.last) / 1000, 1 / 30) : 1 / 60;
      state.last = time;
      let moving = false;
      for (const key of KEYS) {
        const force = -STIFFNESS * (state.position[key] - state.target[key]) - DAMPING * state.velocity[key];
        state.velocity[key] += force * dt;
        state.position[key] += state.velocity[key] * dt;
        if (Math.abs(state.position[key] - state.target[key]) > 0.005 || Math.abs(state.velocity[key]) > 0.05) moving = true;
      }
      if (!moving) Object.assign(state.position, state.target);
      state.apply();
      state.frame = moving ? requestAnimationFrame(step) : 0;
    };
    motion.current = state;
    return () => { cancelAnimationFrame(state.frame); motion.current = null; };
  }, []);

  // The breeze: irregular, mostly small, now and then a double flick or a slightly stronger gust,
  // with long calm spells. Nothing happens while the tab is hidden, the menu is open, the button is not
  // on screen (wide layouts), or the visitor prefers reduced motion.
  useEffect(() => {
    let timer = 0;
    const schedule = (first = false) => {
      const calm = first ? random(1800, 4200) : Math.random() < 0.22 ? random(11000, 17000) : random(3200, 9500);
      timer = window.setTimeout(gust, calm);
    };
    const kick = (strength: number, direction: number) => {
      const state = motion.current;
      if (!state) return;
      state.velocity.lean += direction * random(20, 34) * strength;
      state.velocity.tip += direction * random(15, 25) * strength;
      state.velocity.veins -= direction * random(28, 46) * strength;
      state.start();
    };
    const gust = () => {
      const shown = (svg.current?.getClientRects().length ?? 0) > 0;
      if (!open && shown && !document.hidden && !prefersReducedMotion()) {
        const roll = Math.random();
        const direction = sign();
        if (roll < 0.62) kick(random(0.65, 1), direction);
        else if (roll < 0.86) { kick(random(0.6, 0.85), direction); window.setTimeout(() => kick(random(0.4, 0.6), direction), random(150, 240)); }
        else kick(random(1.3, 1.55), direction);
      }
      schedule();
    };
    schedule(true);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Opening turns the leaf toward the light with a deliberate little swing; closing lets it fall back.
  // With reduced motion the new pose is shown at once, so the state change is still visible.
  const shownOpen = useRef<boolean | null>(null);
  useEffect(() => {
    const state = motion.current;
    if (!state) return;
    const pose = open ? OPEN : REST;
    Object.assign(state.target, pose);
    // Only a real change of state gets the swing; the first render (and a re-run with the same state) just sets the pose.
    const changed = shownOpen.current !== null && shownOpen.current !== open;
    shownOpen.current = open;
    if (!changed) { Object.assign(state.position, pose); state.apply(); return; }
    if (prefersReducedMotion()) {
      Object.assign(state.position, pose);
      Object.assign(state.velocity, REST);
      state.apply();
      return;
    }
    state.velocity.lean += open ? -28 : 22;
    state.start();
  }, [open]);

  return (
    <svg ref={svg} className="leaf-menu-icon" viewBox="-6 -2 102 138" aria-hidden="true" focusable="false">
      <g ref={whole}>
        <path ref={edge} d={outline(0)} />
        <path d="M17.36 74.1L86.99 128.71" />
        <g ref={veins}>
          <path d="M44.8 37.76V95.71" />
          <path d="M44.8 95.71L72.4 74.1" />
        </g>
      </g>
    </svg>
  );
}
