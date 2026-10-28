import { useEffect, useRef } from "react";

// The original hero particle field (260 points drifting upward with gentle
// pointer parallax), drawn with a 2D canvas instead of three.js so it adds no
// library download. Same field size, camera and motion as before.
const COUNT = 260;
const FIELD = { x: 22, y: 16, z: 12 };
const CAMERA_Z = 12;
const FOV = (55 * Math.PI) / 180;
const DRIFT_PER_SECOND = 0.24;
const POINT_SIZE = 0.09;

type Point = { x: number; y: number; z: number };

export function createField(random = Math.random): Point[] {
  return Array.from({ length: COUNT }, () => ({
    x: (random() - 0.5) * FIELD.x,
    y: (random() - 0.5) * FIELD.y,
    z: (random() - 0.5) * FIELD.z,
  }));
}

export function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const points = createField();
    const pointer = { x: 0, y: 0 };
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let last = 0;
    let elapsed = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const focal = height / 2 / Math.tan(FOV / 2);
      const yaw = elapsed * 0.02 + pointer.x * 0.15;
      const pitch = pointer.y * 0.08;
      const [cosY, sinY, cosX, sinX] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
      context.fillStyle = "#c9b46b";
      for (const point of points) {
        const x1 = point.x * cosY + point.z * sinY;
        const z1 = -point.x * sinY + point.z * cosY;
        const y2 = point.y * cosX - z1 * sinX;
        const z2 = point.y * sinX + z1 * cosX;
        const depth = CAMERA_Z - z2;
        if (depth <= 0.1) continue;
        const scale = focal / depth;
        const radius = Math.max(0.6, (POINT_SIZE * scale) / 2);
        context.globalAlpha = Math.min(0.55, 0.25 + scale / focal);
        context.beginPath();
        context.arc(width / 2 + x1 * scale, height / 2 - y2 * scale, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick);
      const delta = last ? Math.min((time - last) / 1000, 0.05) : 0;
      last = time;
      if (!visible || document.hidden) return;
      elapsed += delta;
      for (const point of points) {
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
      if (reduced) { draw(); return; }
      window.addEventListener("pointermove", onPointer, { passive: true });
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancel(start);
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      sizeObserver?.disconnect();
      viewObserver?.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="home-hero__particles" aria-hidden="true" />;
}
