import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export type RailItem = { key: string; to: string; image: string; srcSet?: string; name: string; count: string };

// A gentle invitation to keep browsing, not a ticker: every few seconds the row glides on by exactly one
// card with an eased start and a soft landing, then rests. It stops the moment anyone touches it, hovers it,
// focuses a card, scrolls it or leaves the tab. It is a normal scrolling row, so swiping, trackpads, the
// scrollbar and the arrow buttons all work, and the glide only changes scrollLeft.
const GLIDE_MS = 760; // one card's glide
const DWELL_MS = 2200; // rest between glides
const NUDGE_MS = 520; // an arrow press answers at once and lands softly
const RESUME_AFTER = 2400; // ms of calm before gliding again
const AFTER_HOLD = 900; // rest after a hover, touch or focus ends
const BUTTON_HOLD = 4200;
const RECENTRE_AFTER = 160;
const easeInOut = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 4;
// Three copies of the row (the middle one is the real one): a drift or a swipe can go either way for
// at least one full row before anyone could reach an edge, and the jump back to the middle is invisible.
const COPIES = 3;

function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function CategoryRail({
  items,
  headingId,
  title,
  viewAll,
  previousLabel,
  nextLabel,
  onIntent,
}: {
  items: RailItem[];
  headingId: string;
  title: string;
  viewAll: string;
  previousLabel: string;
  nextLabel: string;
  onIntent?: () => void;
}) {
  const reduced = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // Width of one full row including the gap after it; null while the row fits and nothing needs to loop.
  const [loop, setLoop] = useState<number | null>(null);
  const [inView, setInView] = useState(typeof IntersectionObserver === "undefined");
  const [pageHidden, setPageHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const holds = useRef({ hover: false, touch: false, focus: false, until: 0 });
  const looping = loop !== null;

  const measure = useCallback(() => {
    const frame = scroller.current;
    const row = list.current;
    if (!frame || !row) return;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const children = row.children;
    // With copies present, one row is the distance between the first card and its first clone (the sign
    // flips when the row runs right to left).
    const contentWidth = children.length > items.length
      ? Math.abs((children[items.length] as HTMLElement).offsetLeft - (children[0] as HTMLElement).offsetLeft) - gap
      : row.scrollWidth;
    const overflows = contentWidth > frame.clientWidth + 2;
    setLoop(overflows ? Math.round(contentWidth + gap) : null);
  }, [items.length]);

  useLayoutEffect(() => {
    measure();
    const frame = scroller.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [measure, items]);

  // Start on the middle copy so the row can be scrolled either way from the first moment.
  const sign = () => (scroller.current && getComputedStyle(scroller.current).direction === "rtl" ? -1 : 1);
  useLayoutEffect(() => {
    const frame = scroller.current;
    if (!frame || loop === null) return;
    const position = Math.abs(frame.scrollLeft);
    if (position < loop || position >= loop * 2) frame.scrollLeft = sign() * (loop + (position % loop));
  }, [loop]);

  useEffect(() => {
    const frame = scroller.current;
    if (!frame || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // Whoever scrolls it (finger, wheel, scrollbar, keys, buttons) wins; once the row has been still for a
  // moment it is quietly put back on the middle copy so there is always room to keep going either way.
  useEffect(() => {
    const frame = scroller.current;
    if (!frame || loop === null) return;
    let timer = 0;
    const recentre = () => {
      if (holds.current.touch) return;
      const position = Math.abs(frame.scrollLeft);
      if (position < loop) frame.scrollLeft = sign() * (position + loop);
      else if (position >= loop * 2) frame.scrollLeft = sign() * (position - loop);
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(recentre, RECENTRE_AFTER);
    };
    frame.addEventListener("scroll", onScroll, { passive: true });
    return () => { frame.removeEventListener("scroll", onScroll); window.clearTimeout(timer); };
  }, [loop]);

  // One card plus the gap after it: the distance of one glide or one arrow press.
  const cardStep = () => {
    const row = list.current;
    const card = row?.children[0] as HTMLElement | undefined;
    if (!row || !card) return 0;
    return card.offsetWidth + (parseFloat(getComputedStyle(row).columnGap) || 0);
  };

  const drifting = looping && !reduced && inView && !pageHidden;
  useEffect(() => {
    const frame = scroller.current;
    if (!frame || !drifting || loop === null) return;
    const direction = sign();
    let raf = 0;
    let written = frame.scrollLeft;
    let glide: { from: number; to: number; start: number } | null = null;
    let nextAt = performance.now() + RESUME_AFTER;

    const step = (time: number) => {
      raf = requestAnimationFrame(step);
      const hold = holds.current;
      const actual = frame.scrollLeft;
      // Anything other than our own last write means a person moved it: let go, follow them, then wait.
      if (Math.abs(actual - written) > 1.5) { glide = null; nextAt = time + RESUME_AFTER; written = actual; }
      if (hold.hover || hold.touch || hold.focus || time < hold.until) {
        glide = null;
        written = actual;
        nextAt = Math.max(nextAt, Math.max(time, hold.until) + AFTER_HOLD);
        return;
      }
      if (!glide) {
        if (time < nextAt) return;
        const size = cardStep();
        if (!size) return;
        // Land on the next card edge (a card that is nearly there already counts as reached).
        let from = Math.abs(actual);
        let to = (Math.floor(from / size + 0.15) + 1) * size;
        // Past the middle copy, step back one full row first: it looks identical, so nobody sees the jump.
        if (to > loop * 2) { from -= loop; to -= loop; }
        glide = { from, to, start: time };
      }
      const progress = Math.min((time - glide.start) / GLIDE_MS, 1);
      frame.scrollLeft = direction * (glide.from + (glide.to - glide.from) * easeInOut(progress));
      written = frame.scrollLeft;
      if (progress >= 1) { glide = null; nextAt = time + DWELL_MS; }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [drifting, loop]);

  // Arrow presses glide too; pressing again mid-glide carries on from where that glide was heading.
  const nudging = useRef<{ raf: number; to: number } | null>(null);
  useEffect(() => () => { if (nudging.current) cancelAnimationFrame(nudging.current.raf); }, []);
  function nudge(direction: 1 | -1) {
    const frame = scroller.current;
    const size = cardStep();
    if (!frame || !size) return;
    holds.current.until = performance.now() + BUTTON_HOLD;
    const delta = direction * sign() * size;
    if (reduced) { frame.scrollBy({ left: delta, behavior: "auto" }); return; }
    const from = frame.scrollLeft;
    const to = (nudging.current ? nudging.current.to : from) + delta;
    if (nudging.current) cancelAnimationFrame(nudging.current.raf);
    const start = performance.now();
    const run = (time: number) => {
      const progress = Math.min(Math.max((time - start) / NUDGE_MS, 0), 1);
      frame.scrollLeft = from + (to - from) * easeOut(progress);
      if (progress < 1) nudging.current = { raf: requestAnimationFrame(run), to };
      else nudging.current = null;
    };
    nudging.current = { raf: requestAnimationFrame(run), to };
  }

  const hold = (key: "hover" | "touch" | "focus", on: boolean) => {
    holds.current[key] = on;
    if (!on) holds.current.until = Math.max(holds.current.until, performance.now() + 600);
  };
  const copies = looping ? COPIES : 1;

  return (
    <>
      <div className="section-head">
        <h2 id={headingId}>{title}</h2>
        <div className="section-head__aside">
          {looping ? (
            <div className="rail__controls">
              <button type="button" className="rail__arrow rail__arrow--prev" aria-label={previousLabel} onClick={() => nudge(-1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5 8 12l7 7" /></svg>
              </button>
              <button type="button" className="rail__arrow rail__arrow--next" aria-label={nextLabel} onClick={() => nudge(1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
              </button>
            </div>
          ) : null}
          <Link to="/shop">{viewAll}</Link>
        </div>
      </div>
      <div
        ref={scroller}
        className="rail__scroller"
        role="group"
        aria-label={title}
        onPointerEnter={(event) => { if (event.pointerType !== "touch") hold("hover", true); }}
        onPointerLeave={() => hold("hover", false)}
        onPointerDown={() => hold("touch", true)}
        onPointerUp={() => hold("touch", false)}
        onPointerCancel={() => hold("touch", false)}
        onWheel={() => { holds.current.until = performance.now() + RESUME_AFTER; }}
        onFocus={(event) => { try { hold("focus", (event.target as HTMLElement).matches(":focus-visible")); } catch { hold("focus", true); } }}
        onBlur={() => hold("focus", false)}
      >
        <ul ref={list} className="home-categories">
          {Array.from({ length: copies }, (_, copy) => items.map((item) => {
            // The middle copy is the one assistive technology and the keyboard know about; the others are only
            // there so the row can wrap round, and are still ordinary links for anyone tapping or clicking them.
            const real = copies === 1 || copy === 1;
            return (
              <li key={`${copy}-${item.key}`} aria-hidden={real ? undefined : true}>
                <Link to={item.to} onMouseEnter={onIntent} tabIndex={real ? undefined : -1}>
                  <img src={item.image} srcSet={item.srcSet} sizes={item.srcSet ? "(max-width: 600px) 70vw, 280px" : undefined} alt="" width={640} height={640} loading="lazy" decoding="async" draggable={false} />
                  <span className="home-categories__name">{item.name}</span>
                  <span className="home-categories__count">{item.count}</span>
                </Link>
              </li>
            );
          }))}
        </ul>
      </div>
    </>
  );
}
