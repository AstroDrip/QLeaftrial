import { useEffect, useRef, type CSSProperties } from "react";

// A botanical line figure in the spirit of Hairline: a single stem and alternating leaves drawn only in
// strokes (colour and weight come from CSS), which draws itself in once when it scrolls into view and,
// when `reactive`, leans toward the pointer. One requestAnimationFrame loop eases the lean and stops as
// soon as nothing is moving; it listens only while the figure is on screen.

type Pair = readonly [number, number];
const STEM: readonly [Pair, Pair, Pair, Pair] = [[100, 392], [82, 300], [120, 150], [104, 18]];

function onStem(t: number) {
  const [p0, p1, p2, p3] = STEM;
  const u = 1 - t;
  const at = (axis: 0 | 1) => u ** 3 * p0[axis] + 3 * u * u * t * p1[axis] + 3 * u * t * t * p2[axis] + t ** 3 * p3[axis];
  const slope = (axis: 0 | 1) => 3 * u * u * (p1[axis] - p0[axis]) + 6 * u * t * (p2[axis] - p1[axis]) + 3 * t * t * (p3[axis] - p2[axis]);
  return { x: at(0), y: at(1), heading: (Math.atan2(slope(1), slope(0)) * 180) / Math.PI };
}

const LEAF = "M0 0C12-13 34-15 56-3C34 9 12 12 0 0Z";
const VEIN = "M3 0L47-3";

// Leaves alternate sides and shrink toward the tip; the last one continues the stem.
const LEAVES = [0.1, 0.2, 0.31, 0.42, 0.53, 0.64, 0.75, 0.86, 0.96].map((t, index) => {
  const side = index % 2 === 0 ? 1 : -1;
  const { x, y, heading } = onStem(t);
  return { x, y, angle: heading + side * 56, scale: 1.18 - t * 0.7, depth: 4 + t * 10, side };
});
const TIP = (() => {
  const { x, y, heading } = onStem(1);
  return { x, y, angle: heading + 4, scale: 0.42, depth: 16, side: 1 };
})();

function reducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export function LeafLines({ reactive = false, className = "" }: { reactive?: boolean; className?: string }) {
  const root = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    if (typeof IntersectionObserver === "undefined" || reducedMotion()) svg.classList.add("is-drawn");

    let frame = 0;
    let listening = false;
    const target = { x: 0, y: 0 };
    const eased = { x: 0, y: 0 };

    const step = () => {
      eased.x += (target.x - eased.x) * 0.08;
      eased.y += (target.y - eased.y) * 0.08;
      svg.style.setProperty("--px", eased.x.toFixed(3));
      svg.style.setProperty("--py", eased.y.toFixed(3));
      const settled = Math.abs(target.x - eased.x) < 0.002 && Math.abs(target.y - eased.y) < 0.002;
      frame = settled ? 0 : requestAnimationFrame(step);
    };
    const onMove = (event: PointerEvent) => {
      const box = svg.getBoundingClientRect();
      const half = Math.max(window.innerWidth, 1) / 2;
      target.x = Math.max(-1, Math.min(1, (event.clientX - (box.left + box.width / 2)) / half));
      target.y = Math.max(-1, Math.min(1, (event.clientY - (box.top + box.height / 2)) / half));
      if (!frame) frame = requestAnimationFrame(step);
    };
    const listen = (on: boolean) => {
      if (!reactive || on === listening) return;
      listening = on;
      if (on) window.addEventListener("pointermove", onMove, { passive: true });
      else {
        window.removeEventListener("pointermove", onMove);
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) svg.classList.add("is-drawn");
      listen(entry.isIntersecting);
    }, { threshold: 0.2 });
    observer?.observe(svg);
    if (!observer) listen(true);

    return () => {
      observer?.disconnect();
      listen(false);
    };
  }, [reactive]);

  return (
    <svg ref={root} className={`leaf-lines ${className}`.trim()} viewBox="0 0 200 400" aria-hidden="true" focusable="false">
      <g className="leaf-lines__plant">
        <path className="leaf-lines__stroke" pathLength={1} d={`M${STEM[0][0]} ${STEM[0][1]}C${STEM[1][0]} ${STEM[1][1]} ${STEM[2][0]} ${STEM[2][1]} ${STEM[3][0]} ${STEM[3][1]}`} />
        {[...LEAVES, TIP].map((leaf, index) => (
          <g key={index} transform={`translate(${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)}) rotate(${leaf.angle.toFixed(1)})`}>
            <g className="leaf-lines__leaf" style={{ "--depth": leaf.depth, "--delay": `${index * 90}ms` } as CSSProperties}>
              <g transform={`scale(${leaf.scale.toFixed(2)})`}>
                <path className="leaf-lines__stroke leaf-lines__outline" pathLength={1} d={LEAF} />
                <path className="leaf-lines__stroke leaf-lines__vein" pathLength={1} d={VEIN} />
              </g>
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}
