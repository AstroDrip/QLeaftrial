import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";

vi.mock("animejs", () => ({
  default: Object.assign(vi.fn(() => ({ pause: vi.fn() })), {
    stagger: vi.fn(() => 0),
    remove: vi.fn(),
    timeline: vi.fn(() => { const chain:any={duration:100,pause:vi.fn(),seek:vi.fn(),add:vi.fn()}; chain.add.mockReturnValue(chain); return chain; }),
  }),
}));
vi.mock("three", () => ({}));

describe("HomePage reference choreography", () => {
  afterEach(() => { cleanup(); document.documentElement.removeAttribute("data-motion"); });
  it("renders the exact editorial journey in reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /for the love of art and plants/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /shop plants/i })).toHaveAttribute("href", "/shop");
    expect(screen.getByText("122")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
  });
});
