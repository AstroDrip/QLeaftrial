import { useEffect, useRef } from "react";

// The hero particle field, with the brand kit's leaf pair (its "Brand Elements" leaf pattern) as every
// particle instead of a dot. The field, camera and motion are unchanged from the dot version: points
// drifting upward with a slow turn and a gentle pointer parallax, in the same colour and with the same
// depth-based fading, drawn on a 2D canvas so it adds no library download. Each leaf keeps the fixed,
// random tilt the pattern gives its leaves.
const COUNT = 90;
const FIELD = { x: 22, y: 16, z: 12 };
const CAMERA_Z = 12;
const FOV = (55 * Math.PI) / 180;
const DRIFT_PER_SECOND = 0.24;
// How wide a leaf is in field units (the dots were 0.09 across): about 24px at the middle of the field.
const LEAF_WIDTH = 0.6;
const COLOR = "#c9b46b";
const SPRITE = "/brand/leaf-pair.png";

type Leaf = { x: number; y: number; z: number; tilt: number };

export function createField(random = Math.random): Leaf[] {
  return Array.from({ length: COUNT }, () => ({
    x: (random() - 0.5) * FIELD.x,
    y: (random() - 0.5) * FIELD.y,
    z: (random() - 0.5) * FIELD.z,
    tilt: random() * Math.PI * 2,
  }));
}

export function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const leaves = createField();
    const pointer = { x: 0, y: 0 };
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let last = 0;
    let elapsed = 0;
    let leaf: HTMLCanvasElement | null = null;
    let disposed = false;

    // The brand artwork is a white silhouette; it is tinted once to the particle colour.
    const sprite = new Image();
    sprite.onload = () => {
      if (disposed) return;
      const tinted = document.createElement("canvas");
      tinted.width = sprite.naturalWidth;
      tinted.height = sprite.naturalHeight;
      const paint = tinted.getContext("2d");
      if (!paint) return;
      paint.drawImage(sprite, 0, 0);
      paint.globalCompositeOperation = "source-in";
      paint.fillStyle = COLOR;
      paint.fillRect(0, 0, tinted.width, tinted.height);
      leaf = tinted;
      if (reduced) draw();
    };
    sprite.src = SPRITE;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    function draw() {
      context!.clearRect(0, 0, width, height);
      if (!leaf) return;
      const focal = height / 2 / Math.tan(FOV / 2);
      const yaw = elapsed * 0.02 + pointer.x * 0.15;
      const pitch = pointer.y * 0.08;
      const [cosY, sinY, cosX, sinX] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
      const aspect = leaf.height / leaf.width;
      for (const point of leaves) {
        const x1 = point.x * cosY + point.z * sinY;
        const z1 = -point.x * sinY + point.z * cosY;
        const y2 = point.y * cosX - z1 * sinX;
        const z2 = point.y * sinX + z1 * cosX;
        const depth = CAMERA_Z - z2;
        if (depth <= 0.1) continue;
        const scale = focal / depth;
        const size = Math.max(5, LEAF_WIDTH * scale);
        context!.globalAlpha = Math.min(0.55, 0.25 + scale / focal);
        context!.save();
        context!.translate(width / 2 + x1 * scale, height / 2 - y2 * scale);
        context!.rotate(point.tilt);
        context!.drawImage(leaf, -size / 2, (-size * aspect) / 2, size, size * aspect);
        context!.restore();
      }
      context!.globalAlpha = 1;
    }

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const delta = last ? Math.min((time - last) / 1000, 0.05) : 0;
      last = time;
      if (!visible || document.hidden) return;
      elapsed += delta;
      for (const point of leaves) {
        point.y += DRIFT_PER_SECOND * delta;
        if (point.y > FIELD.y / 2) point.y = -FIELD.y / 2;
      }
      draw();
    };

    const onPointer = (event: PointerEvent) => {
      pointer.x = event.clientX / window.innerWidth - 0.5;
      pointer.y = event.clientY / window.innerHeight - 0.5;
    };

    resize();
    const sizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { resize(); draw(); });
    sizeObserver?.observe(canvas);
    const viewObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    viewObserver?.observe(canvas);

    // Start after the page has painted so the particles never delay first load.
    const schedule = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 300));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const start = schedule(() => {
      // A page that has already gone (an unmounted tree, a torn-down test) must not be touched.
      if (disposed || typeof window === "undefined") return;
      if (reduced) { draw(); return; }
      window.addEventListener("pointermove", onPointer, { passive: true });
      frame = requestAnimationFrame(tick);
    });

    return () => {
      disposed = true;
      cancel(start);
      cancelAnimationFrame(frame);
      sprite.onload = null;
      window.removeEventListener("pointermove", onPointer);
      sizeObserver?.disconnect();
      viewObserver?.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="home-hero__particles" aria-hidden="true" />;
}
