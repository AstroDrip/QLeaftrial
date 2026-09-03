import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the QLeaves landmark and primary navigation", () => {
    render(<App />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    const brandLink = screen.getByRole("link", { name: /QLeaves home/i });
    expect(brandLink).toHaveAttribute("href", "/");
    expect(
      screen.getByText("QLeaves", { selector: ".site-header__wordmark" }),
    ).toBeInTheDocument();
  });
});


