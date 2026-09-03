import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";

const motionMock = vi.hoisted(() => ({
  revert: vi.fn(),
}));

vi.mock("gsap", () => ({
  __esModule: true,
  default: {
    registerPlugin: vi.fn(),
    context: vi.fn((callback?: () => void) => {
      if (typeof callback === "function") callback();
      return { revert: motionMock.revert, add: vi.fn() };
    }),
    timeline: vi.fn(() => {
      const chain = {
        from: vi.fn(),
        to: vi.fn(),
        fromTo: vi.fn(),
        add: vi.fn(),
      };
      chain.from.mockReturnValue(chain);
      chain.to.mockReturnValue(chain);
      chain.fromTo.mockReturnValue(chain);
      chain.add.mockReturnValue(chain);
      return chain;
    }),
    utils: { toArray: vi.fn(() => []), selector: vi.fn(() => () => []) },
  },
}));

vi.mock("gsap/ScrollTrigger", () => ({
  __esModule: true,
  ScrollTrigger: {
    isMatchMedia: vi.fn(),
    getAll: vi.fn(() => []),
    prototype: {},
  },
  default: { isMatchMedia: vi.fn() },
}));

describe("HomePage editorial choreography", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    motionMock.revert.mockClear();
    document.documentElement.removeAttribute("data-motion");
  });

  it("renders the editorial path without requiring motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: /plants change a room/i }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /shop plants/i })).toHaveAttribute(
      "href",
      "/shop",
    );
    expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
  });

  it("reverts its scoped animations on unmount", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { unmount } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(document.documentElement).toHaveAttribute("data-motion", "enabled");
    unmount();
    expect(motionMock.revert).toHaveBeenCalled();
  });
});
