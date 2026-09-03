import { useEffect, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * True when the user has requested reduced motion at the OS level.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const matchMedia = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!matchMedia) {
    return true;
  }

  return matchMedia.matches;
}

/**
 * Drives the editorial homepage choreography with GSAP ScrollTrigger.
 *
 * - Under reduced motion it only sets `data-motion="reduced"` and creates no animations.
 * - Otherwise it sets `data-motion="enabled"` and builds a single scoped context whose
 *   timeline is reverted on unmount, preventing memory leaks.
 */
export function useHeroMotion(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const rootElement = document.documentElement;
    const reduced = prefersReducedMotion();

    rootElement.setAttribute("data-motion", reduced ? "reduced" : "enabled");

    if (reduced || !root.current) {
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        defaults: { duration: 0.6, ease: "power2.out" },
        scrollTrigger: {
          trigger: root.current,
          start: "top center",
          scrub: true,
          anticipatePin: 1,
        },
      });

      timeline
        .from(".home__wordmark", { opacity: 0, y: 32 })
        .from(".home__headline", { opacity: 0, y: 16 }, "-=0.3")
        .from(".home__subhead", { opacity: 0, y: 12 }, "-=0.4")
        .from(".home__fragment", { opacity: 0, y: 24, stagger: 0.08 }, "-=0.5")
        .from(".home__featured", { opacity: 0, scale: 0.92 }, "-=0.4");
    }, root.current);

    return () => {
      context.revert();
    };
  }, [root]);
}
