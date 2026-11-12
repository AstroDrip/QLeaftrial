import { Geometry, Mesh, Plane, Program, Renderer } from "ogl";
import {
  CLUSTER_HEIGHT,
  CLUSTER_WIDTH,
  LEAF_COLORS,
  LEFT_CLUSTER,
  RIGHT_CLUSTER,
  STALK,
  STALK_WIDTH,
  drawOrder,
  type Leaf,
} from "./botanical-leaves";

// The moving version of the hero plants: the same leaves as the static SVG, drawn in one instanced
// WebGL call, each leaf swaying a little from its base in a slow, uneven breeze, the tips moving most.
// Loaded only after the page has painted, and only where it is welcome (see BotanicalHero).

const vertex = /* glsl */ `
attribute vec3 position;
attribute vec2 uv;
attribute vec2 aBase;
attribute vec4 aShape; // angle (rad), length, width, curl  (pixels / radians, already mirrored)
attribute vec3 aColor;
attribute vec2 aMotion; // depth, phase
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uPointer;
varying vec2 vLeaf; // across (-1..1), along (0..1)
varying vec3 vColor;
varying float vDepth;

float halfWidth(float t, float width) {
  float stalk = width * ${STALK_WIDTH.toFixed(3)} * 0.5;
  if (t <= ${STALK.toFixed(3)}) return stalk;
  float s = (t - ${STALK.toFixed(3)}) / (1.0 - ${STALK.toFixed(3)});
  return max(stalk, width * 0.5 * pow(sin(3.14159265 * pow(s, 0.78)), 0.88));
}

void main() {
  float t = uv.y;
  float side = uv.x * 2.0 - 1.0;
  float depth = aMotion.x;
  float phase = aMotion.y;
  float reach = 1.0 - depth * 0.55;
  // An uneven breeze: two slow waves and a rarer gust, different for every leaf.
  float wind = sin(uTime * 0.62 + phase) * 0.55 + sin(uTime * 1.31 + phase * 1.7) * 0.3
    + pow(max(0.0, sin(uTime * 0.23 + phase * 0.5)), 6.0) * 0.9;
  float sway = wind * 0.035 * reach; // radians at the base: about two degrees
  float bend = wind * 0.05 * reach;  // extra arc toward the tip
  float angle = aShape.x + sway; // the breeze pushes every leaf the same way
  float len = aShape.y;
  float along = t * len;
  float across = (aShape.w + bend) * len * t * t + side * halfWidth(t, aShape.z);
  vec2 p = aBase + vec2(across * cos(angle) + along * sin(angle), -(along * cos(angle) - across * sin(angle)));
  p += uPointer * (1.0 - depth) * 6.0;
  vec2 clip = vec2(p.x / uResolution.x * 2.0 - 1.0, 1.0 - p.y / uResolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vLeaf = vec2(side, t);
  vColor = aColor * (1.0 - depth * 0.28);
  vDepth = depth;
}
`;

const fragment = /* glsl */ `
precision highp float;
varying vec2 vLeaf;
varying vec3 vColor;
varying float vDepth;

void main() {
  float side = vLeaf.x;
  float t = vLeaf.y;
  float blade = smoothstep(${STALK.toFixed(3)}, ${STALK.toFixed(3)} + 0.04, t);
  vec3 color = vColor;
  // Light from the upper left: one half of the blade a touch brighter.
  color *= mix(0.9, 1.07, smoothstep(-0.6, 0.6, -side));
  // Midrib and the fine side veins, only on the blade.
  float rib = 1.0 - smoothstep(0.02, 0.06, abs(side));
  float veins = 1.0 - smoothstep(0.0, 0.07, abs(fract(t * 8.0 - abs(side) * 1.1) - 0.5) - 0.43);
  color = mix(color, color * 1.32 + 0.04, rib * blade * 0.55 + veins * blade * 0.12 * (1.0 - abs(side)));
  // A soft rim so edges are smooth without multisampling.
  float alpha = 1.0 - smoothstep(0.965, 1.0, abs(side));
  gl_FragColor = vec4(color, alpha);
}
`;

type Cell = { left: number; top: number; width: number; height: number };

export type BotanicalScene = { dispose: () => void };

export function startBotanicalScene(options: {
  canvas: HTMLCanvasElement;
  cells: () => { left: Cell; right: Cell } | null;
  onLost: () => void;
}): BotanicalScene | null {
  const { canvas, cells, onLost } = options;
  let renderer: Renderer;
  try {
    renderer = new Renderer({ canvas, alpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio || 1, 1.75), premultipliedAlpha: false });
  } catch {
    return null;
  }
  const gl = renderer.gl;
  if (!gl) return null;
  gl.clearColor(0, 0, 0, 0);

  const leaves: Array<{ leaf: Leaf; mirror: boolean }> = [
    ...drawOrder(LEFT_CLUSTER).map((leaf) => ({ leaf, mirror: false })),
    ...drawOrder(RIGHT_CLUSTER).map((leaf) => ({ leaf, mirror: true })),
  ].sort((a, b) => b.leaf.depth - a.leaf.depth);
  const count = leaves.length;
  const base = new Float32Array(count * 2);
  const shape = new Float32Array(count * 4);
  const color = new Float32Array(count * 3);
  const motion = new Float32Array(count * 2);
  leaves.forEach(({ leaf }, index) => {
    color.set(LEAF_COLORS[leaf.color], index * 3);
    motion.set([leaf.depth, leaf.phase], index * 2);
  });

  const plane = new Plane(gl, { width: 1, height: 1, widthSegments: 2, heightSegments: 28 });
  const geometry = new Geometry(gl, {
    position: { size: 3, data: plane.attributes.position.data as Float32Array },
    uv: { size: 2, data: plane.attributes.uv.data as Float32Array },
    index: { data: plane.attributes.index.data as Uint16Array },
    aBase: { instanced: 1, size: 2, data: base },
    aShape: { instanced: 1, size: 4, data: shape },
    aColor: { instanced: 1, size: 3, data: color },
    aMotion: { instanced: 1, size: 2, data: motion },
  });
  const program = new Program(gl, {
    vertex,
    fragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    cullFace: false,
    uniforms: { uResolution: { value: [1, 1] }, uTime: { value: 0 }, uPointer: { value: [0, 0] } },
  });
  const mesh = new Mesh(gl, { geometry, program });

  // Places every leaf exactly where the SVG draws it: each group fills its cell like
  // preserveAspectRatio="xMinYMax meet" (left) / "xMaxYMax meet" (right).
  const layout = () => {
    // Measure the hero, not the canvas: the renderer writes its own size onto the canvas element.
    const host = canvas.parentElement ?? canvas;
    const width = host.clientWidth;
    const height = host.clientHeight;
    renderer.setSize(width, height);
    program.uniforms.uResolution.value = [width, height];
    const boxes = cells();
    if (!boxes) return;
    leaves.forEach(({ leaf, mirror }, index) => {
      const cell = mirror ? boxes.right : boxes.left;
      const scale = Math.min(cell.width / CLUSTER_WIDTH, cell.height / CLUSTER_HEIGHT);
      const originX = mirror ? cell.left + cell.width - CLUSTER_WIDTH * scale : cell.left;
      const originY = cell.top + cell.height - CLUSTER_HEIGHT * scale;
      const sign = mirror ? -1 : 1;
      const x = mirror ? CLUSTER_WIDTH - leaf.x : leaf.x;
      base.set([originX + x * scale, originY + CLUSTER_HEIGHT * scale], index * 2);
      shape.set([(leaf.angle * sign * Math.PI) / 180, leaf.length * scale, leaf.width * scale, leaf.curl * sign], index * 4);
    });
    geometry.attributes.aBase.needsUpdate = true;
    geometry.attributes.aShape.needsUpdate = true;
  };

  let frame = 0;
  let running = false;
  let started = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const draw = (time: number) => {
    frame = requestAnimationFrame(draw);
    if (!started) started = time;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    program.uniforms.uTime.value = (time - started) / 1000 + 4;
    program.uniforms.uPointer.value = [pointer.x, pointer.y];
    renderer.render({ scene: mesh });
  };
  const play = () => { if (!running) { running = true; frame = requestAnimationFrame(draw); } };
  const pause = () => { running = false; cancelAnimationFrame(frame); };

  let inView = true;
  const update = () => (inView && !document.hidden ? play() : pause());
  const onVisibility = () => update();
  const onPointer = (event: PointerEvent) => {
    pointer.tx = event.clientX / window.innerWidth - 0.5;
    pointer.ty = event.clientY / window.innerHeight - 0.5;
  };
  const onLostContext = (event: Event) => { event.preventDefault(); pause(); onLost(); };

  layout();
  const sizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { layout(); if (!running) renderer.render({ scene: mesh }); });
  sizeObserver?.observe(canvas.parentElement ?? canvas);
  const viewObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); });
  viewObserver?.observe(canvas);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pointermove", onPointer, { passive: true });
  canvas.addEventListener("webglcontextlost", onLostContext);
  update();

  return {
    dispose() {
      pause();
      sizeObserver?.disconnect();
      viewObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("webglcontextlost", onLostContext);
      geometry.remove();
      program.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
