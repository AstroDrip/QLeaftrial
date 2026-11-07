import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeafMenuIcon } from "./LeafMenuIcon";

const lean = (container: HTMLElement) => container.querySelector(".leaf-menu-icon > g")!.getAttribute("transform");

describe("LeafMenuIcon", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] }));
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("draws the emblem as separate strokes and hides it from assistive technology", () => {
    const { container } = render(<LeafMenuIcon open={false} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.querySelectorAll("path")).toHaveLength(4);
    expect(lean(container)).toBe("rotate(0.000 80 124)");
  });

  it("swings toward the open pose when the menu opens and settles back when it closes", () => {
    const { container, rerender } = render(<LeafMenuIcon open={false} />);
    rerender(<LeafMenuIcon open />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(lean(container)).toBe("rotate(-7.000 80 124)");
    rerender(<LeafMenuIcon open={false} />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(lean(container)).toBe("rotate(0.000 80 124)");
  });

  it("stays perfectly still for reduced motion, but still shows the open pose at once", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const { container, rerender } = render(<LeafMenuIcon open={false} />);
    act(() => { vi.advanceTimersByTime(60000); });
    expect(lean(container)).toBe("rotate(0.000 80 124)");
    rerender(<LeafMenuIcon open />);
    expect(lean(container)).toBe("rotate(-7.000 80 124)");
  });
});
