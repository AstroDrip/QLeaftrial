import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../../app/providers";
import { FreeDeliveryFlyer } from "./FreeDeliveryFlyer";
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

  function layOut(targets: Array<"header" | "floating">) {
    const track = document.createElement("div");
    track.setAttribute("data-fd-track", "");
    document.body.append(track);
    const boxes = new Map<Element, DOMRect>([[track, { left: 100, top: 400, width: 300, height: 8, right: 400, bottom: 408, x: 100, y: 400, toJSON: () => ({}) }]]);
    for (const kind of targets) {
      const target = document.createElement("a");
      target.dataset.fdTarget = kind;
      document.body.append(target);
      boxes.set(target, kind === "header"
        ? { left: 320, top: 12, width: 42, height: 42, right: 362, bottom: 54, x: 320, y: 12, toJSON: () => ({}) }
        : { left: 120, top: 700, width: 150, height: 52, right: 270, bottom: 752, x: 120, y: 700, toJSON: () => ({}) });
    }
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return boxes.get(this) ?? ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    });
  }

  it("carries the line to the header cart icon and ends as a ring around it", () => {
    layOut(["header"]);
    render(<Providers><FreeDeliveryFlyer /></Providers>);
    expect(screen.queryByTestId("free-delivery-flyer")).not.toBeInTheDocument();

    act(() => useFreeDeliveryStore.setState({ phase: "fly" }));
    const flyer = screen.getByTestId("free-delivery-flyer");
    act(() => { vi.advanceTimersByTime(16); });
    // It starts as the line: as wide as the track and 8px tall.
    expect(parseFloat(flyer.style.width)).toBeCloseTo(300, 0);
    expect(flyer.style.height).toBe("8px");

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.flyMs / 2); });
    expect(parseFloat(flyer.style.width)).toBeLessThan(300);

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.flyMs); });
    // 42px icon plus 5px each side = a 52px ring, and the sequence is over.
    expect(flyer.style.width).toBe("52px");
    expect(flyer.style.height).toBe("52px");
    expect(phase()).toBe("done");
    expect(screen.queryByTestId("free-delivery-flyer")).not.toBeInTheDocument();
  });

  it("prefers the floating cart button when it is on screen", () => {
    layOut(["header", "floating"]);
    render(<Providers><FreeDeliveryFlyer /></Providers>);
    act(() => useFreeDeliveryStore.setState({ phase: "fly" }));

    act(() => { vi.advanceTimersByTime(FREE_DELIVERY_TIMINGS.flyMs + 50); });

    expect(phase()).toBe("done");
  });

  it("finishes straight away when there is no banner line or no cart icon to fly to", () => {
    render(<Providers><FreeDeliveryFlyer /></Providers>);
    act(() => useFreeDeliveryStore.setState({ phase: "fly" }));

    expect(phase()).toBe("done");
  });
});
