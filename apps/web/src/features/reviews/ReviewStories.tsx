import "./reviews.css";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSiteLanguage } from "../../app/providers";
import { LeafLines } from "./LeafLines";
import { ReviewPattern } from "./ReviewPattern";
import { ReviewSheet } from "./ReviewSheet";
import { reviewApi } from "./review-api";
import type { PublicReview } from "./review-types";

// Each story stays for 2⅓ seconds (a third less than 3.5); the active tick fills over exactly this time.
const ADVANCE_MS = 2333;
const SWIPE_DISTANCE = 56;
const DRAG_START = 8;

function usePrefersReducedMotion(): boolean {
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

// Where a sheet sits in the pile, measured from the one in front. The sheet that just left waits at the
// back of the pile as "gone" so that stepping back brings it in from the side it left by.
type Place = "front" | "next" | "after" | "wait" | "gone";
function placeOf(position: number, total: number): Place {
  if (position === 0) return "front";
  if (position === 1) return "next";
  if (position === 2) return "after";
  return position === total - 1 && total >= 4 ? "gone" : "wait";
}

function StoryCarousel({ items }: { items: PublicReview[] }) {
  const { content, isArabic } = useSiteLanguage();
  const t = content.home.stories;
  const total = items.length;
  const reduced = usePrefersReducedMotion();
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; dx: number; moving: boolean } | null>(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(typeof IntersectionObserver === "undefined");
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [touching, setTouching] = useState(false);
  const [pageHidden, setPageHidden] = useState(() => typeof document !== "undefined" && document.hidden);

  const current = Math.min(active, total - 1);
  const playing = total > 1 && !reduced && inView && !hovered && !keyboardFocus && !touching && !pageHidden;
  const go = useCallback((delta: number) => setActive((index) => (Math.min(index, total - 1) + delta + total) % total), [total]);

  useEffect(() => {
    const element = section.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (total < 2 || (event.pointerType === "mouse" && event.button !== 0)) return;
    if ((event.target as HTMLElement).closest("a, button")) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, moving: false };
    setTouching(true);
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    if (!state.moving) {
      if (Math.abs(dx) < DRAG_START || Math.abs(dx) < Math.abs(event.clientY - state.y)) return;
      state.moving = true;
      stage.current?.setPointerCapture(event.pointerId);
      stage.current?.classList.add("is-dragging");
    }
    state.dx = dx;
    // The sheet follows the finger with a little resistance, so a long drag never leaves the stage.
    stage.current?.style.setProperty("--drag-x", String(Math.round(dx * (1 - Math.min(Math.abs(dx) / 700, 0.45)))));
  }

  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    stage.current?.classList.remove("is-dragging");
    stage.current?.style.setProperty("--drag-x", "0");
    setTouching(false);
    if (state.moving && event.type === "pointerup" && Math.abs(state.dx) >= SWIPE_DISTANCE) {
      // Swiping toward the start edge reveals the next story; the reading direction decides which edge that is.
      go((state.dx < 0 ? 1 : -1) * (isArabic ? -1 : 1));
    }
  }

  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (total < 2 || (event.target as HTMLElement).closest("input, textarea, select")) return;
    if (event.key === "ArrowRight") { event.preventDefault(); go(isArabic ? -1 : 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(isArabic ? 1 : -1); }
  }

  function focusIn(event: React.FocusEvent<HTMLElement>) {
    try { setKeyboardFocus((event.target as HTMLElement).matches(":focus-visible")); } catch { setKeyboardFocus(true); }
  }

  return (
    <section
      ref={section}
      className="stories"
      aria-labelledby="stories-title"
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocus={focusIn}
      onBlur={() => setKeyboardFocus(false)}
      onKeyDown={keyDown}
    >
      <ReviewPattern />
      <div className="container stories__inner">
        <div className="stories__intro">
          <p className="eyebrow">{t.eyebrow}</p>
          <h2 id="stories-title">{t.title}</h2>
        </div>

        <div
          className="stories__stage story-carousel"
          role="group"
          aria-roledescription="carousel"
          aria-label={t.carousel}
          aria-live={playing ? "off" : "polite"}
        >
          <div
            ref={stage}
            className="story-carousel__track"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}
          >
            {items.map((review, index) => {
              const place = placeOf((index - current + total) % total, total);
              return (
                <div
                  key={review.id}
                  className="story-slide"
                  data-place={place}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={t.slide(index + 1, total)}
                  aria-hidden={place === "front" ? undefined : true}
                  inert={place !== "front"}
                >
                  <ReviewSheet review={review} />
                </div>
              );
            })}
          </div>
        </div>

        {total > 1 ? (
          <div className="stories__controls">
            <span className="stories__count" aria-hidden="true">
              <b>{String(current + 1).padStart(2, "0")}</b>
              <i>/ {String(total).padStart(2, "0")}</i>
            </span>
            <div className="stories__arrows">
              <button type="button" className="stories__arrow stories__arrow--prev" aria-label={t.previous} onClick={() => go(-1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5 8 12l7 7" /></svg>
              </button>
              <button type="button" className="stories__arrow stories__arrow--next" aria-label={t.next} onClick={() => go(1)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
              </button>
            </div>
            <div className="stories__ticks">
              {items.map((review, index) => (
                <button
                  key={review.id}
                  type="button"
                  className="stories__tick"
                  aria-label={t.goTo(index + 1, total)}
                  aria-current={index === current ? "true" : undefined}
                  onClick={() => setActive(index)}
                >
                  {index === current ? (
                    <span
                      key={`${current}-${reduced}`}
                      className="stories__tick-fill"
                      style={{ "--advance": `${ADVANCE_MS}ms`, animationPlayState: playing ? "running" : "paused" } as CSSProperties}
                      onAnimationEnd={() => go(1)}
                    />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="stories__figure" aria-hidden="true"><LeafLines reactive /></div>
      </div>
    </section>
  );
}

export function ReviewStories() {
  const reviews = useQuery({ queryKey: ["reviews"], queryFn: reviewApi.list, staleTime: 60_000 });
  // Nothing published (or not loaded yet): the band simply isn't there, rather than an empty carousel.
  if (!reviews.data?.length) return null;
  return <StoryCarousel items={reviews.data} />;
}
