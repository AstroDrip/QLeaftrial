import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FADE_MS, PhotoCrossfade } from "./PhotoCrossfade";
import { ProductCard } from "./ProductCard";
import { ProductGallery } from "./product-presentation";
import { activeSlideshowCount } from "./photo-autoplay";
import type { ProductMedia, ProductSummary } from "./product-types";

// jsdom loads no images and has no layout: images are "loaded" by firing their load event, and visibility is driven
// through a stand-in IntersectionObserver.
const observers: Array<{ callback: IntersectionObserverCallback; target?: Element }> = [];
class FakeObserver {
  constructor(public callback: IntersectionObserverCallback) { observers.push(this as never); }
  observe(target: Element) { (this as unknown as { target: Element }).target = target; }
  disconnect() { /* nothing */ }
  unobserve() { /* nothing */ }
}
function setVisible(visible: boolean) {
  for (const observer of observers) {
    const target = (observer as unknown as { target?: Element }).target;
    if (!target) continue;
    act(() => observer.callback([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0, target } as IntersectionObserverEntry], observer as never));
  }
}
let reducedMotion = false;

const photo = (name: string, width = 640, height = 640): ProductMedia[] => [
  { url: `/media/${name}-640.webp`, altText: name, width, height, purpose: "catalog" },
  { url: `/media/${name}-1200.webp`, altText: name, width: width * 2, height: height * 2, purpose: "detail" },
];
const layers = (container: HTMLElement) => [...container.querySelectorAll(".photo-crossfade__layer")];
const loadAll = (container: HTMLElement) => act(async () => {
  for (const img of container.querySelectorAll("img")) fireEvent.load(img);
  await new Promise((resolve) => setTimeout(resolve, 30));
});

describe("product photo slideshows", () => {
  beforeEach(() => {
    observers.length = 0;
    reducedMotion = false;
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reducedMotion && query.includes("reduced-motion"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  describe("crossfade", () => {
    it("keeps the current photograph fully shown until the next one has loaded, then fades it in and removes the old one", async () => {
      const photos = [photo("a"), photo("b")];
      const { container, rerender } = render(<PhotoCrossfade photos={photos} index={0} alt="Plant" />);
      expect(layers(container)).toHaveLength(1);
      expect(layers(container)[0]).toHaveAttribute("data-shown");

      rerender(<PhotoCrossfade photos={photos} index={1} alt="Plant" />);
      // The new photograph is on top but invisible while it loads; the old one is still fully shown.
      expect(layers(container)).toHaveLength(2);
      expect(layers(container)[0]).toHaveAttribute("data-shown");
      expect(layers(container)[1]).not.toHaveAttribute("data-shown");
      expect(layers(container)[1].querySelector("img")).toHaveAttribute("src", "/media/b-640.webp");

      await loadAll(container);
      expect(layers(container)[1]).toHaveAttribute("data-shown");
      expect(layers(container)[0]).toHaveAttribute("data-shown"); // still underneath during the fade
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, FADE_MS + 120)); });
      expect(layers(container)).toHaveLength(1);
      expect(layers(container)[0].querySelector("img")).toHaveAttribute("src", "/media/b-640.webp");
    });

    it("replaces a photograph that is still loading instead of stacking them", async () => {
      const photos = [photo("a"), photo("b"), photo("c")];
      const { container, rerender } = render(<PhotoCrossfade photos={photos} index={0} alt="Plant" />);
      rerender(<PhotoCrossfade photos={photos} index={1} alt="Plant" />);
      rerender(<PhotoCrossfade photos={photos} index={2} alt="Plant" />);
      expect(layers(container)).toHaveLength(2);
      expect(layers(container)[1].querySelector("img")).toHaveAttribute("src", "/media/c-640.webp");
    });
  });

  describe("product cards", () => {
    const product = (media: ProductMedia[]): ProductSummary => ({
      id: "p1", slug: "plant", name: "Plant", category: "Indoor Plants", light: null, priceQar: 120, stock: 4, inStock: true,
      image: media[0] ?? null, media,
    } as ProductSummary);
    function renderCard(media: ProductMedia[]) {
      return render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter><ul><ProductCard product={product(media)} orderingEnabled /></ul></MemoryRouter>
        </QueryClientProvider>,
      );
    }

    it("changes photograph by itself while on screen, with no scrolling, and stops when off screen", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
      const { container } = renderCard([...photo("a"), ...photo("b"), ...photo("c")]);
      expect(container.querySelector("[data-photos]")).toHaveAttribute("data-photos", "3");
      expect(activeSlideshowCount()).toBe(0);
      setVisible(true);
      expect(activeSlideshowCount()).toBe(1);
      act(() => { vi.advanceTimersByTime(6_000); });
      expect(container.querySelectorAll(".photo-crossfade__layer img")[1]).toHaveAttribute("src", "/media/b-640.webp");
      setVisible(false);
      expect(activeSlideshowCount()).toBe(0);
    });

    it("shows a picture only once, and no slideshow at all for a single photograph", () => {
      const { container } = renderCard([...photo("a"), ...photo("a")]);
      expect(container.querySelector("[data-photos]")).toBeNull();
      expect(container.querySelectorAll("img")).toHaveLength(1);
    });

    it("does not play for visitors who asked for reduced motion", () => {
      reducedMotion = true;
      renderCard([...photo("a"), ...photo("b")]);
      setVisible(true);
      expect(activeSlideshowCount()).toBe(0);
    });

    it("keeps the card's shape from its first photograph", () => {
      const { container } = renderCard([...photo("a", 600, 800), ...photo("b")]);
      expect(container.querySelector(".product-card__media")).toHaveAttribute("data-orientation", "portrait");
    });
  });

  describe("product page gallery", () => {
    it("plays by itself, and a chosen photograph holds for a while before it carries on", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
      const { container } = render(<ProductGallery media={[...photo("a"), ...photo("b"), ...photo("c")]} alt="Plant" isArabic={false} />);
      setVisible(true);
      const pressed = () => screen.getAllByRole("button", { name: /Photo \d of 3/ }).findIndex((button) => button.getAttribute("aria-pressed") === "true");
      expect(pressed()).toBe(0);
      act(() => { vi.advanceTimersByTime(7_000); });
      expect(pressed()).toBe(1);

      fireEvent.click(screen.getByRole("button", { name: "Photo 3 of 3" }));
      expect(pressed()).toBe(2);
      act(() => { vi.advanceTimersByTime(12_000); });
      expect(pressed()).toBe(2); // the customer's choice wins for a while
      act(() => { vi.advanceTimersByTime(9_000); });
      expect(pressed()).not.toBe(2);

      fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
      fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
      expect(container.querySelector(".product-gallery__stage")).toHaveAttribute("data-orientation", "square");
    });

    it("labels its controls in Arabic", () => {
      render(<ProductGallery media={[...photo("a"), ...photo("b")]} alt="نبات" isArabic />);
      expect(screen.getByRole("button", { name: "الصورة التالية" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "صور المنتج" })).toBeInTheDocument();
    });
  });
});
