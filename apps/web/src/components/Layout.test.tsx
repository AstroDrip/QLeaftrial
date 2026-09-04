import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Layout } from "./Layout";

describe("Layout", () => {
  it("provides navigation, skip link, and cart destination", () => {
    render(
      <MemoryRouter>
        <Layout>
          <p>Page</p>
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cart/i })).toHaveAttribute("href", "/cart");
    expect(screen.getByText("Founded in 2020")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /instagram/i })).toHaveAttribute("href", "https://www.instagram.com/qleaves.qa?igsi=MWh6YzR4dWMyazA0cw==");
    expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute("href", "https://wa.me/97477551056");
    expect(screen.getByText("QOZYD").tagName).toBe("STRONG");
  });
});
