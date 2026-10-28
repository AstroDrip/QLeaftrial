import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HERO_POOL, HeroGallery, ROTATE_MS, pickRandom } from "./HeroGallery";

function sources() {
  return screen.getAllByRole("img").map((image) => image.getAttribute("src"));
}

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: query.includes("reduce") ? reducedMotion : false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

describe("HeroGallery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom does not load images; resolve them immediately.
    vi.stubGlobal("Image", class { onload: (() => void) | null = null; set src(_value: string) { this.onload?.(); } });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("only uses photos that ship with the site", () => {
    for (const image of HERO_POOL) expect(existsSync(resolve("public", `.${image.src}`)), image.src).toBe(true);
  });

  it("picks distinct photos at random", () => {
    const first = pickRandom(HERO_POOL, 3, () => 0);
    const second = pickRandom(HERO_POOL, 3, () => 0.99);
    expect(new Set(first.map((image) => image.src)).size).toBe(3);
    expect(first).not.toEqual(second);
  });

  it("swaps in a new, not-already-shown photo every few seconds", () => {
    mockMatchMedia(false);
    render(<HeroGallery isArabic={false} />);
    const before = sources();

    act(() => { vi.advanceTimersByTime(ROTATE_MS); });

    const after = sources();
    expect(after).toHaveLength(3);
    expect(after).not.toEqual(before);
    expect(new Set(after).size).toBe(3);
  });

  it("does not rotate for visitors who prefer reduced motion", () => {
    mockMatchMedia(true);
    render(<HeroGallery isArabic={false} />);
    const before = sources();

    act(() => { vi.advanceTimersByTime(ROTATE_MS * 3); });

    expect(sources()).toEqual(before);
  });
});
