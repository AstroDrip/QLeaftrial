import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryRail, type RailItem } from "./CategoryRail";

const items: RailItem[] = ["Indoor", "Outdoor", "Gift", "Table top", "Garden"].map((name) => ({
  key: name, to: `/shop?category=${name}`, image: `/${name}.webp`, name, count: "4 products",
}));

const CARD = 300;
const original = {
  clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  scrollWidth: Object.getOwnPropertyDescriptor(Element.prototype, "scrollWidth"),
  offsetLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetLeft"),
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
};

// jsdom has no layout, so the row's geometry is described here: cards of CARD px with no gap.
function stubLayout(frameWidth: number, direction: 1 | -1 = 1) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get(this: HTMLElement) { return this.classList.contains("rail__scroller") ? frameWidth : 0; } });
  Object.defineProperty(Element.prototype, "scrollWidth", { configurable: true, get(this: HTMLElement) { return this.tagName === "UL" ? this.children.length * CARD : 0; } });
  Object.defineProperty(HTMLElement.prototype, "offsetLeft", { configurable: true, get(this: HTMLElement) { return this.tagName === "LI" ? direction * [...this.parentElement!.children].indexOf(this) * CARD : 0; } });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get(this: HTMLElement) { return this.tagName === "LI" ? CARD : 0; } });
  // The row's scroll position, stored like a real one (jsdom keeps it at 0).
  Object.defineProperty(HTMLElement.prototype, "scrollLeft", { configurable: true, get(this: HTMLElement & { _left?: number }) { return this._left ?? 0; }, set(this: HTMLElement & { _left?: number }, value: number) { this._left = value; } });
  HTMLElement.prototype.scrollBy = function (this: HTMLElement & { _left?: number }, options?: ScrollToOptions | number) {
    this._left = (this._left ?? 0) + (typeof options === "object" ? options.left ?? 0 : 0);
  } as typeof HTMLElement.prototype.scrollBy;
}

function restoreLayout() {
  for (const [name, target] of [["clientWidth", HTMLElement.prototype], ["scrollWidth", Element.prototype], ["offsetLeft", HTMLElement.prototype], ["offsetWidth", HTMLElement.prototype]] as const) {
    const saved = original[name];
    if (saved) Object.defineProperty(target, name, saved);
    else delete (target as unknown as Record<string, unknown>)[name];
  }
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollLeft;
}

function renderRail() {
  return render(
    <MemoryRouter>
      <CategoryRail items={items} headingId="cats" title="Shop by category" viewAll="View all" previousLabel="Previous categories" nextLabel="Next categories" />
    </MemoryRouter>,
  );
}

function row(container: HTMLElement) {
  return container.querySelector<HTMLDivElement>(".rail__scroller")!;
}

describe("CategoryRail", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "performance"] }));
  afterEach(() => {
    cleanup();
    restoreLayout();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is a plain row of links, with no copies, arrows or movement, when everything already fits", () => {
    stubLayout(2000);
    const { container } = renderRail();

    expect(container.querySelectorAll("li")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /categories/i })).not.toBeInTheDocument();
    expect(row(container).scrollLeft).toBe(0);
    act(() => { vi.advanceTimersByTime(6000); });
    expect(row(container).scrollLeft).toBe(0);
  });

  it("wraps a long row in copies that only sighted visitors see: one set of links for the keyboard and screen readers", () => {
    stubLayout(500);
    const { container } = renderRail();

    expect(container.querySelectorAll("li")).toHaveLength(15);
    // Three copies: the one in the middle is real, the two around it are hidden from assistive technology.
    const hidden = container.querySelectorAll("li[aria-hidden='true']");
    expect(hidden).toHaveLength(10);
    expect(screen.getAllByRole("link", { name: /products/ }).filter((link) => link.closest("ul"))).toHaveLength(5);
    for (const clone of hidden) expect(within(clone as HTMLElement).getByRole("link", { hidden: true })).toHaveAttribute("tabindex", "-1");
    // Every card, copies included, still goes where its name says.
    expect([...container.querySelectorAll("ul a")].map((link) => link.getAttribute("href"))).toEqual([...items, ...items, ...items].map((item) => item.to));
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/shop");
    // It starts on the middle copy so it can be scrolled either way straight away.
    expect(row(container).scrollLeft).toBe(5 * CARD);
  });

  it("keeps its copies when the row runs right to left, where each card sits further left than the last", () => {
    stubLayout(500, -1);
    const { container } = renderRail();

    expect(container.querySelectorAll("li")).toHaveLength(15);
    expect(screen.getByRole("button", { name: "Next categories" })).toBeInTheDocument();
  });

  it("glides on by one card at a time with an eased start and landing, then rests", () => {
    stubLayout(500);
    const { container } = renderRail();
    const frame = row(container);
    const start = frame.scrollLeft;
    const at = (ms: number) => { act(() => { vi.advanceTimersByTime(ms); }); return frame.scrollLeft - start; };

    // Nothing moves straight after load: it waits a moment first.
    expect(at(1500)).toBe(0);
    // A quarter of the way into the glide it has covered well under a quarter of the card (an eased start, not a jump)...
    const early = at(900 + 190);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(CARD / 4);
    // ...halfway it is mid-card, and it lands exactly one card on.
    const middle = at(190);
    expect(middle).toBeGreaterThan(CARD / 4);
    expect(middle).toBeLessThan(CARD * 3 / 4);
    expect(at(500)).toBe(CARD);
    // Then it rests before the next card.
    expect(at(1500)).toBe(CARD);
    expect(at(2000)).toBe(2 * CARD);
  });

  it("wraps from the end of the middle copy without a visible jump", () => {
    stubLayout(500);
    const { container } = renderRail();
    const frame = row(container);

    // Left one pixel short of the end of the middle copy, it carries on from the same spot in the copy before.
    frame.scrollLeft = 2 * 5 * CARD - 1;
    act(() => { vi.advanceTimersByTime(2400 + 760 + 200); });
    expect(frame.scrollLeft).toBe(5 * CARD + CARD);
  });

  it("glides one card per arrow press, and a second press mid-glide adds a card", () => {
    stubLayout(500);
    const { container } = renderRail();
    const frame = row(container);
    const before = frame.scrollLeft;

    fireEvent.click(screen.getByRole("button", { name: "Next categories" }));
    act(() => { vi.advanceTimersByTime(100); });
    expect(frame.scrollLeft).toBeGreaterThan(before);
    expect(frame.scrollLeft).toBeLessThan(before + CARD);
    act(() => { vi.advanceTimersByTime(600); });
    expect(frame.scrollLeft).toBe(before + CARD);

    fireEvent.click(screen.getByRole("button", { name: "Previous categories" }));
    act(() => { vi.advanceTimersByTime(700); });
    expect(frame.scrollLeft).toBe(before);

    fireEvent.click(screen.getByRole("button", { name: "Next categories" }));
    act(() => { vi.advanceTimersByTime(150); });
    fireEvent.click(screen.getByRole("button", { name: "Next categories" }));
    act(() => { vi.advanceTimersByTime(700); });
    expect(frame.scrollLeft).toBe(before + 2 * CARD);
  });

  it("stops while hovered, touched or focused, and starts again a moment after", () => {
    stubLayout(500);
    const { container } = renderRail();
    const frame = row(container);
    act(() => { vi.advanceTimersByTime(4000); });

    const moves = (ms: number) => { const from = frame.scrollLeft; act(() => { vi.advanceTimersByTime(ms); }); return frame.scrollLeft - from; };
    // One full rest-and-glide cycle always contains a glide.
    expect(moves(3200)).toBeGreaterThan(10);

    fireEvent.pointerEnter(frame);
    expect(moves(3000)).toBe(0);
    fireEvent.pointerLeave(frame);
    expect(moves(300)).toBe(0);
    expect(moves(2500)).toBeGreaterThan(10);

    fireEvent.pointerDown(frame);
    expect(moves(3000)).toBe(0);
    fireEvent.pointerUp(frame);
    expect(moves(2500)).toBeGreaterThan(10);
  });

  it("treats someone else's scrolling as the leader and waits before drifting again", () => {
    stubLayout(500);
    const { container } = renderRail();
    const frame = row(container);
    act(() => { vi.advanceTimersByTime(4000); });

    frame.scrollLeft = frame.scrollLeft + 400;
    const from = frame.scrollLeft;
    act(() => { vi.advanceTimersByTime(1500); });
    expect(frame.scrollLeft).toBe(from);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(frame.scrollLeft).toBeGreaterThan(from);
  });

  it("never drifts for people who asked for reduced motion, but can still be scrolled and looped by hand", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    stubLayout(500);
    const { container } = renderRail();
    const frame = row(container);
    const start = frame.scrollLeft;

    act(() => { vi.advanceTimersByTime(20000); });
    expect(frame.scrollLeft).toBe(start);

    // Scrolled by hand into the first copy, it is put back on the middle one once it has stopped.
    frame.scrollLeft = 100;
    fireEvent.scroll(frame);
    act(() => { vi.advanceTimersByTime(300); });
    expect(frame.scrollLeft).toBe(100 + 5 * CARD);
    expect(screen.getByRole("button", { name: "Next categories" })).toBeInTheDocument();
  });
});
