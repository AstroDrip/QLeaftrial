import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../../app/providers";
import { FreeDeliveryFlyer, outlineHalfLength, outlinePoint } from "./FreeDeliveryFlyer";
import { useCartStore } from "./cart-store";
import { FREE_DELIVERY_TIMINGS, useFreeDeliveryController, useFreeDeliveryRing, useFreeDeliveryStore } from "./free-delivery-store";

const item = (quantity: number) => ({ id: "p1", slug: "orchid", name: "Orchid", priceQar: 50, stock: 99, image: null, quantity });
const phase = () => useFreeDeliveryStore.getState().phase;

describe("free delivery sequence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCartStore.setState({ items: [] });
    useFreeDeliveryStore.setState({ phase: "progress" });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("holds the message, closes the banner, then sends the line to the cart icon, in that order", () => {
    useCartStore.setState({ items: [item(2)] });
    renderHook(() => useFreeDeliveryController());
    expect(phase()).toBe("progress");

    act(() => useCartStore.setState({ items: [item(3)] }));
    expect(phase()).toBe("celebrate");

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.celebrateMs - 1); });
    expect(phase()).toBe("celebrate");
    act(() => { vi.advanceTimersByTime(1); });
    expect(phase()).toBe("collapse");

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.collapseMs); });
    expect(phase()).toBe("fly");

    // If the flight cannot happen the sequence still finishes on its own.
    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.flyFallbackMs); });
    expect(phase()).toBe("done");
  });

  it("does not replay the celebration for a basket that already met the goal when the site opened", () => {
    useCartStore.setState({ items: [item(4)] });
    renderHook(() => useFreeDeliveryController());

    expect(phase()).toBe("done");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(phase()).toBe("done");
  });

  it("brings the banner back and takes the ring away when items are removed", () => {
    useCartStore.setState({ items: [item(4)] });
    const ring = renderHook(() => { useFreeDeliveryController(); return useFreeDeliveryRing(); });
    expect(ring.result.current).toBe(true);

    act(() => useCartStore.setState({ items: [item(2)] }));

    expect(phase()).toBe("progress");
    expect(ring.result.current).toBe(false);

    act(() => useCartStore.setState({ items: [item(3)] }));
    expect(phase()).toBe("celebrate");
  });

  it("drops back to the banner if the basket shrinks in the middle of the celebration", () => {
    useCartStore.setState({ items: [item(2)] });
    renderHook(() => useFreeDeliveryController());
    act(() => useCartStore.setState({ items: [item(3)] }));
    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.celebrateMs + 100); });
    expect(phase()).toBe("collapse");

    act(() => useCartStore.setState({ items: [item(1)] }));
    expect(phase()).toBe("progress");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(phase()).toBe("progress");
  });

  it("skips the flight for people who prefer reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() }) as unknown as MediaQueryList);
    useCartStore.setState({ items: [item(2)] });
    renderHook(() => useFreeDeliveryController());
    act(() => useCartStore.setState({ items: [item(3)] }));

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.celebrateMs); });

    expect(phase()).toBe("done");
  });
});

describe("free delivery flyer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    useFreeDeliveryStore.setState({ phase: "progress" });
    document.body.innerHTML = "";
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ""; });

  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

  // A 300px line at y=400, and (optionally) a 150x52 floating cart button below it.
  function layOut(withButton: boolean) {
    const track = document.createElement("div");
    track.setAttribute("data-fd-track", "");
    document.body.append(track);
    const boxes = new Map<Element, DOMRect>([[track, rect(100, 396, 300, 8)]]);
    if (withButton) {
      const button = document.createElement("a");
      button.dataset.fdTarget = "floating";
      document.body.append(button);
      boxes.set(button, rect(175, 460, 150, 52));
    }
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) { return boxes.get(this) ?? rect(0, 0, 0, 0); });
  }

  const points = (flyer: HTMLElement) => [...flyer.querySelector("path")!.getAttribute("d")!.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
  const span = (line: Array<{ x: number }>) => Math.max(...line.map((point) => point.x)) - Math.min(...line.map((point) => point.x));

  it("lays out a stadium outline from the top middle, round the left cap, to the bottom middle", () => {
    const box = { left: 100, top: 200, width: 158, height: 60 };
    const straight = 158 / 2 - 30;
    expect(outlinePoint(box, 0)).toEqual({ x: 179, y: 200 });
    expect(outlinePoint(box, straight)).toEqual({ x: 179 - straight, y: 200 });
    const bottomOfCap = outlinePoint(box, straight + Math.PI * 30);
    expect(bottomOfCap.x).toBeCloseTo(179 - straight, 5);
    expect(bottomOfCap.y).toBeCloseTo(260, 5);
    const end = outlinePoint(box, outlineHalfLength(box));
    expect(end.x).toBeCloseTo(179, 5);
    expect(end.y).toBeCloseTo(260, 5);
  });

  it("slides the line onto the button, then bends both ends round it until they meet underneath", () => {
    layOut(true);
    render(<Providers><FreeDeliveryFlyer /></Providers>);
    expect(screen.queryByTestId("free-delivery-flyer")).not.toBeInTheDocument();

    act(() => useFreeDeliveryStore.setState({ phase: "fly" }));
    const flyer = screen.getByTestId("free-delivery-flyer");
    act(() => { vi.advanceTimersByTime(16); });
    // It starts as the line: flat, and as wide as the track.
    let line = points(flyer);
    expect(new Set(line.map((point) => Math.round(point.y))).size).toBe(1);
    expect(span(line)).toBeGreaterThan(290);

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.flyMs * 0.4); });
    // Part-way it lies flat on the button's top edge (ring top = 460 - 4) and has narrowed to it.
    line = points(flyer);
    expect(Math.round(line[0].y)).toBe(456);
    expect(span(line)).toBeLessThan(140);

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.flyMs * 0.4); });
    // Now the ends have bent down the sides: the line is no longer flat.
    line = points(flyer);
    expect(Math.max(...line.map((point) => point.y))).toBeGreaterThan(456 + 10);

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.flyMs); });
    expect(phase()).toBe("done");
    expect(screen.queryByTestId("free-delivery-flyer")).not.toBeInTheDocument();
  });

  it("ends as a closed ring whose two ends meet at the bottom middle of the button", () => {
    layOut(true);
    render(<Providers><FreeDeliveryFlyer /></Providers>);
    act(() => useFreeDeliveryStore.setState({ phase: "fly" }));
    const flyer = screen.getByTestId("free-delivery-flyer");

    // Stop on the last frames, just before the sequence hands over to the button's own ring.
    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.flyMs - 20); });
    const ring = points(flyer);
    const first = ring[0];
    const last = ring[ring.length - 1];
    expect(Math.abs(first.x - last.x)).toBeLessThan(6);
    expect(Math.abs(first.y - last.y)).toBeLessThan(6);
    // The ring is the button's box grown by 4px: bottom = 460 + 52 + 4.
    expect(first.y).toBeGreaterThan(500);
    expect(Math.max(...ring.map((point) => point.y))).toBeLessThanOrEqual(516.5);
    expect(Math.min(...ring.map((point) => point.x))).toBeGreaterThanOrEqual(170.5);
    expect(Math.max(...ring.map((point) => point.x))).toBeLessThanOrEqual(329.5);
  });

  it("just draws the line back in when there is no floating cart button to circle", () => {
    layOut(false);
    render(<Providers><FreeDeliveryFlyer /></Providers>);
    act(() => useFreeDeliveryStore.setState({ phase: "fly" }));
    const flyer = screen.getByTestId("free-delivery-flyer");

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.flyMs / 2); });
    expect(Number(flyer.querySelector("path")!.getAttribute("opacity"))).toBeLessThan(1);
    expect(new Set(points(flyer).map((point) => Math.round(point.y))).size).toBe(1);

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.flyMs); });
    expect(phase()).toBe("done");
  });

  it("finishes straight away when there is no banner line to start from", () => {
    render(<Providers><FreeDeliveryFlyer /></Providers>);
    act(() => useFreeDeliveryStore.setState({ phase: "fly" }));

    expect(phase()).toBe("done");
  });
});
