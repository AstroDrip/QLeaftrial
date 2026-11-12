// The hero's two plant groups, as data shared by the static picture (SVG, shown at once) and the moving
// one (WebGL), so the hand-over between them is seamless. Each group is drawn in a 400 x 600 box whose
// bottom edge is the soil line; leaves grow up from it. "Inward" angles lean toward the headline.

export const CLUSTER_WIDTH = 400;
export const CLUSTER_HEIGHT = 600;

export type LeafColor = "deep" | "moss" | "leaf" | "sage" | "fresh" | "gold";

export const LEAF_COLORS: Record<LeafColor, [number, number, number]> = {
  deep: [0.157, 0.22, 0.169], // --moss-deep
  moss: [0.247, 0.357, 0.263], // --moss
  leaf: [0.247, 0.529, 0.043], // brand green #3F870B
  sage: [0.435, 0.561, 0.353],
  fresh: [0.38, 0.62, 0.2],
  gold: [0.788, 0.706, 0.42], // the brand's leaf-gold accent
};

export type Leaf = {
  x: number; // base, in the 400 x 600 box (y is always the soil line)
  angle: number; // degrees from upright; positive leans inward
  length: number;
  width: number;
  curl: number; // how much the leaf arcs; positive arcs inward
  color: LeafColor;
  depth: number; // 0 front .. 1 back: darker, moves less
  phase: number; // where in the breeze cycle this leaf starts
};

export const LEFT_CLUSTER: Leaf[] = [
  { x: 22, angle: 8, length: 560, width: 46, curl: 0.16, color: "leaf", depth: 1, phase: 0.2 },
  { x: 60, angle: -8, length: 520, width: 124, curl: 0.1, color: "deep", depth: 0.9, phase: 1.3 },
  { x: 30, angle: -26, length: 380, width: 110, curl: 0.12, color: "sage", depth: 0.75, phase: 2.1 },
  { x: 120, angle: 18, length: 470, width: 150, curl: -0.08, color: "moss", depth: 0.6, phase: 0.7 },
  { x: 170, angle: 34, length: 360, width: 120, curl: -0.1, color: "leaf", depth: 0.4, phase: 2.8 },
  { x: 90, angle: 4, length: 300, width: 96, curl: 0.05, color: "fresh", depth: 0.3, phase: 1.9 },
  { x: 210, angle: 52, length: 220, width: 88, curl: -0.12, color: "sage", depth: 0.2, phase: 3.4 },
  { x: 236, angle: 62, length: 160, width: 64, curl: -0.1, color: "gold", depth: 0.05, phase: 0.4 },
];

export const RIGHT_CLUSTER: Leaf[] = [
  { x: 50, angle: -4, length: 540, width: 70, curl: 0.15, color: "deep", depth: 1, phase: 2.4 },
  { x: 20, angle: -22, length: 420, width: 62, curl: 0.14, color: "leaf", depth: 0.85, phase: 0.9 },
  { x: 100, angle: 14, length: 480, width: 86, curl: -0.1, color: "moss", depth: 0.7, phase: 3.1 },
  { x: 150, angle: 28, length: 400, width: 102, curl: -0.12, color: "sage", depth: 0.55, phase: 1.6 },
  { x: 80, angle: 40, length: 330, width: 76, curl: 0.06, color: "fresh", depth: 0.4, phase: 0.1 },
  { x: 190, angle: 48, length: 260, width: 108, curl: -0.08, color: "moss", depth: 0.3, phase: 2.7 },
  { x: 130, angle: 6, length: 200, width: 118, curl: 0.04, color: "leaf", depth: 0.15, phase: 1.1 },
  { x: 230, angle: 66, length: 160, width: 60, curl: -0.1, color: "gold", depth: 0.05, phase: 3.9 },
];

// The stalk is the first part of the leaf; the blade widens quickly, is broadest a third of the way up
// and narrows to a fine tip.
export const STALK = 0.16;
export const STALK_WIDTH = 0.05; // of the leaf's width

export function halfWidth(t: number, width: number): number {
  if (t <= STALK) return (width * STALK_WIDTH) / 2;
  const s = (t - STALK) / (1 - STALK);
  return Math.max((width * STALK_WIDTH) / 2, (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.78)), 0.88));
}

type Point = [number, number];

// One side of the leaf (side = 1 or -1) at rest, in box coordinates. `mirror` flips a right-hand group.
function edge(leaf: Leaf, side: number, mirror: boolean, steps = 28): Point[] {
  const sign = mirror ? -1 : 1;
  const angle = (leaf.angle * sign * Math.PI) / 180;
  const baseX = mirror ? CLUSTER_WIDTH - leaf.x : leaf.x;
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const along = t * leaf.length;
    const across = leaf.curl * sign * leaf.length * t * t + side * halfWidth(t, leaf.width);
    points.push([
      baseX + across * Math.cos(angle) + along * Math.sin(angle),
      CLUSTER_HEIGHT - (along * Math.cos(angle) - across * Math.sin(angle)),
    ]);
  }
  return points;
}

const fixed = (value: number) => Math.round(value * 10) / 10;

export function leafPath(leaf: Leaf, mirror: boolean): string {
  const right = edge(leaf, 1, mirror);
  const left = edge(leaf, -1, mirror).reverse();
  return [...right, ...left].map(([x, y], index) => `${index ? "L" : "M"}${fixed(x)} ${fixed(y)}`).join("") + "Z";
}

export function midribPath(leaf: Leaf, mirror: boolean): string {
  return edge(leaf, 0, mirror, 14)
    .filter((_, index, all) => index / (all.length - 1) >= STALK * 0.6 && index / (all.length - 1) <= 0.92)
    .map(([x, y], index) => `${index ? "L" : "M"}${fixed(x)} ${fixed(y)}`)
    .join("");
}

export function cssColor(color: LeafColor, depth: number): string {
  // Leaves further back are a little darker, as in the moving version.
  const shade = 1 - depth * 0.28;
  const [r, g, b] = LEAF_COLORS[color].map((channel) => Math.round(channel * shade * 255));
  return `rgb(${r} ${g} ${b})`;
}

// Back leaves first, so nearer ones overlap them.
export const drawOrder = (cluster: Leaf[]) => [...cluster].sort((a, b) => b.depth - a.depth);
