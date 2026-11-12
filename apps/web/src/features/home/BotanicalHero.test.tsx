import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BotanicalHero } from "./BotanicalHero";
import { CLUSTER_HEIGHT, LEFT_CLUSTER, RIGHT_CLUSTER, halfWidth, leafPath } from "./botanical-leaves";

const start = vi.fn(() => ({ dispose: vi.fn() }));
vi.mock("./botanical-scene", () => ({ startBotanicalScene: (...args: unknown[]) => start(...(args as [])) }));

const copy = { eyebrow: "Plants delivered across Qatar", title: "For the love of art and plants.", lead: "Hand-picked plants.", cta: "Shop plants" };

function renderHero() {
  return render(<MemoryRouter><BotanicalHero copy={copy} /></MemoryRouter>);
}

function allowMotion(reduced: boolean, webgl: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue((webgl ? {} : null) as never);
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => { callback(); return 1; });
  vi.stubGlobal("cancelIdleCallback", () => undefined);
}

describe("BotanicalHero", () => {
  beforeEach(() => start.mockClear());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("is complete in the first paint: headline, text, a Shop now link and the still plants", () => {
    allowMotion(true, false);
    const { container } = renderHero();

    expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop plants" })).toHaveAttribute("href", "/shop");
    const groups = container.querySelectorAll(".botanical-hero__plants");
    expect(groups).toHaveLength(2);
    for (const group of groups) expect(group).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".botanical-hero__plants-art path").length).toBe((LEFT_CLUSTER.length + RIGHT_CLUSTER.length) * 2);
    expect(container.querySelector(".botanical-hero")).not.toHaveClass("is-live");
  });

  it("never loads the moving plants for visitors who prefer reduced motion", async () => {
    allowMotion(true, true);
    renderHero();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(start).not.toHaveBeenCalled();
  });

  it("keeps the still plants when the browser has no WebGL", async () => {
    allowMotion(false, false);
    const { container } = renderHero();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(start).not.toHaveBeenCalled();
    expect(container.querySelector(".botanical-hero")).not.toHaveClass("is-live");
  });

  it("starts the moving plants once the page is idle, and cleans them up on the way out", async () => {
    allowMotion(false, true);
    const dispose = vi.fn();
    start.mockReturnValueOnce({ dispose });
    const { container, unmount } = renderHero();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

    expect(start).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".botanical-hero")).toHaveClass("is-live");
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("draws leaves that grow from the soil line, with a fine tip and a narrow stalk", () => {
    const leaf = LEFT_CLUSTER[1];
    const firstPoint = leafPath(leaf, false).match(/^M([\d.]+) ([\d.]+)/)!;
    expect(Number(firstPoint[2])).toBeCloseTo(CLUSTER_HEIGHT, 0);
    expect(halfWidth(1, leaf.width)).toBeLessThan(leaf.width * 0.05);
    expect(halfWidth(0.05, leaf.width)).toBeLessThan(leaf.width * 0.05);
    expect(halfWidth(0.45, leaf.width)).toBeGreaterThan(leaf.width * 0.4);
  });
});
