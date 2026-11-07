import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export type RailItem = { key: string; to: string; image: string; name: string; count: string };

// A gentle invitation to keep browsing, not a ticker: the row drifts at a walking pace and stops the moment
// anyone touches it, hovers it, focuses a card, scrolls it or leaves the tab. It is a normal scrolling row, so
// swiping, trackpads, the scrollbar and the arrow buttons all work, and drifting only changes scrollLeft.
const SPEED = 24; // px per second
const RESUME_AFTER = 2400; // ms of calm before drifting again
const BUTTON_HOLD = 4200;
const RECENTRE_AFTER = 160;
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

  const drifting = looping && !reduced && inView && !pageHidden;
  useEffect(() => {
    const frame = scroller.current;
    if (!frame || !drifting || loop === null) return;
    const direction = sign();
    let raf = 0;
    let last = 0;
    let position = Math.abs(frame.scrollLeft);
    let written = frame.scrollLeft;
    let calmFrom = performance.now() + RESUME_AFTER;

    const step = (time: number) => {
      raf = requestAnimationFrame(step);
      const elapsed = last ? Math.min(time - last, 64) : 0;
      last = time;
      const hold = holds.current;
      const actual = frame.scrollLeft;
      // Anything other than our own last write means a person moved it: follow them, then wait.
      if (Math.abs(actual - written) > 1.5) { position = Math.abs(actual); calmFrom = time + RESUME_AFTER; }
      if (hold.hover || hold.touch || hold.focus || time < hold.until || time < calmFrom) { written = actual; position = Math.abs(actual); return; }
      position += (SPEED * elapsed) / 1000;
      if (position >= loop * 2) position -= loop;
      frame.scrollLeft = direction * position;
      written = frame.scrollLeft;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [drifting, loop]);

  function nudge(direction: 1 | -1) {
    const frame = scroller.current;
    const card = list.current?.children[0] as HTMLElement | undefined;
    if (!frame || !card) return;
    const gap = parseFloat(getComputedStyle(list.current!).columnGap) || 0;
    holds.current.until = performance.now() + BUTTON_HOLD;
    frame.scrollBy({ left: direction * sign() * (card.offsetWidth + gap), behavior: reduced ? "auto" : "smooth" });
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
                  <img src={item.image} alt="" width={640} height={640} loading="lazy" decoding="async" draggable={false} />
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
