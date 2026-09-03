import { useEffect, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

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
      const intro = gsap.timeline({ defaults: { ease: "power3.out" } });

      intro
        .from(".home__wordmark", { opacity: 0, y: 26, duration: 0.8 })
        .from(".home__count", { opacity: 0, y: 54, duration: 1.1 }, "-=0.4")
        .from(".home__count-note", { opacity: 0, x: 24, duration: 0.7 }, "-=0.55")
        .from(".home__headline", { opacity: 0, y: 18, duration: 0.9 }, "-=0.6")
        .from(".home__subhead", { opacity: 0, y: 12, duration: 0.7 }, "-=0.45")
        .from(".home__cta", { opacity: 0, y: 10, duration: 0.7 }, "-=0.35");

      const paperScroll = gsap.timeline({
        scrollTrigger: {
          trigger: ".home__paper-rip",
          start: "top 72%",
          end: "bottom 18%",
          scrub: true,
        },
      });

      paperScroll.to(".home__paper-rip", {
        clipPath: "polygon(0 0, 100% 0, 100% 95%, 92% 100%, 79% 96%, 66% 100%, 52% 94%, 38% 100%, 24% 96%, 0 100%)",
        ease: "none",
      });

      const paperReveal = gsap.timeline({
        scrollTrigger: {
          trigger: ".home__paper-rip",
          start: "top 80%",
          once: true,
        },
      });

      paperReveal.from(".home__paper-rip", {
        opacity: 0.3,
        y: 20,
        duration: 0.9,
        ease: "power2.out",
      });

      const gallery = gsap.timeline({
        scrollTrigger: {
          trigger: ".home__plant-gallery",
          start: "top 80%",
          once: true,
        },
      });

      gallery
        .from(".home__plant-gallery", { opacity: 0, y: 40, duration: 1 })
        .from(".home__plant-card", { opacity: 0, y: 80, stagger: 0.12, duration: 0.85 }, "-=0.55");

      const about = gsap.timeline({
        scrollTrigger: {
          trigger: ".home__about",
          start: "top 86%",
          once: true,
        },
      });

      about.from(".home__about", {
        opacity: 0,
        y: 26,
        duration: 0.8,
      });
    }, root.current);

    return () => {
      context.revert();
    };
  }, [root]);
}
