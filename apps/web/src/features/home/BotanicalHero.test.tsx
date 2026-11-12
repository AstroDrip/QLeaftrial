import { act, cleanup, render, screen } from "@testing-library/react";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BotanicalHero, LEFT_PLANTS, RIGHT_PLANTS } from "./BotanicalHero";

const animate = vi.fn(() => ({ revert: vi.fn() }));
vi.mock("animejs", () => ({ animate: (...args: unknown[]) => animate(...(args as [])), stagger: () => 0 }));

const copy = { eyebrow: "Plants delivered across Qatar", title: "For the love of art and plants.", lead: "Hand-picked plants.", cta: "Shop plants" };

function setup({ reduced, fine }: { reduced: boolean; fine: boolean }) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? reduced : query.includes("pointer: fine") ? fine : false,
    media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
  }));
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => { callback(); return 1; });
  vi.stubGlobal("cancelIdleCallback", () => undefined);
  return render(<MemoryRouter><BotanicalHero copy={copy} /></MemoryRouter>);
}

// jsdom has no PointerEvent; a mouse event carrying pointerType is what the hero reads.
const pointer = (type: "mouse" | "touch") => Object.assign(new MouseEvent("pointermove", { clientX: 0, clientY: 0 }), { pointerType: type });

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

describe("BotanicalHero", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); animate.mockClear(); });

  it("is complete in the first paint: headline, text, Shop now and the plant photographs, hidden from screen readers", () => {
    const { container } = setup({ reduced: true, fine: false });
    expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop plants" })).toHaveAttribute("href", "/shop");
    const plants = container.querySelectorAll<HTMLImageElement>(".botanical-hero__plant");
    expect(plants).toHaveLength(LEFT_PLANTS.length + RIGHT_PLANTS.length);
    for (const group of container.querySelectorAll(".botanical-hero__plants")) expect(group).toHaveAttribute("aria-hidden", "true");
    // Dimensions are reserved, so the page does not shift as the photos load.
    for (const plant of plants) expect(Number(plant.getAttribute("width")) * Number(plant.getAttribute("height"))).toBeGreaterThan(0);
  });

  it("ships every hero photograph it refers to", () => {
    for (const plant of [...LEFT_PLANTS, ...RIGHT_PLANTS]) {
      // Built with node:path: Vite rewrites new URL(..., import.meta.url) into a web asset URL.
      const file = resolve(dirname(fileURLToPath(import.meta.url)), "../../../public/media/hero", `${plant.src}.webp`);
      expect(existsSync(file), plant.src).toBe(true);
    }
  });

  it("never animates for visitors who prefer reduced motion", async () => {
    setup({ reduced: true, fine: true });
    await settle();
    expect(animate).not.toHaveBeenCalled();
  });

  it("follows a mouse pointer, nearer plants further than farther ones, and never hides the photos", async () => {
    const { container } = setup({ reduced: false, fine: true });
    await settle();
    expect(animate).not.toHaveBeenCalled();

    window.dispatchEvent(pointer("mouse"));
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))); });

    const moves = animate.mock.calls as unknown as Array<[HTMLElement, { x: number }]>;
    expect(moves.length).toBe(container.querySelectorAll(".botanical-hero__plant").length);
    const reach = (depth: string) => Math.abs(moves.find(([plant]) => plant.dataset.depth === depth)![1].x);
    expect(reach("front")).toBeGreaterThan(reach("mid"));
    expect(reach("mid")).toBeGreaterThan(reach("rear"));
    expect((animate.mock.calls as unknown as Array<[HTMLElement, object]>).every(([, params]) => !("opacity" in params))).toBe(true);
  });

  it("does not follow touches", async () => {
    setup({ reduced: false, fine: false });
    await settle();
    window.dispatchEvent(pointer("touch"));
    await settle();
    expect(animate).not.toHaveBeenCalled();
  });
});
