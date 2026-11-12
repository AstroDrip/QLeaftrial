import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Providers } from "../app/providers";
import { ShopMenu } from "./ShopMenu";

const categories = [
  { category: "Indoor Plants", label: "Indoor Plants", count: 8, to: "/shop?category=Indoor%20Plants" },
  { category: "Outdoor Plants", label: "Outdoor Plants", count: 4, to: "/shop?category=Outdoor%20Plants" },
];

function renderMenu(items = categories) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><MemoryRouter><Providers client={client}><ShopMenu label="Shop" categories={items} /></Providers></MemoryRouter></QueryClientProvider>);
}

describe("ShopMenu", () => {
  afterEach(cleanup);

  it("keeps Shop a link and opens every category, with counts, from the chevron", () => {
    renderMenu();
    expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute("href", "/shop");
    const toggle = screen.getByRole("button", { name: "Shop categories" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /Indoor Plants\s*8/ })).toHaveAttribute("href", "/shop?category=Indoor%20Plants");
    expect(screen.getByRole("link", { name: "All products" })).toHaveAttribute("href", "/shop");
  });

  it("closes with Escape and returns focus to the chevron", () => {
    renderMenu();
    const toggle = screen.getByRole("button", { name: "Shop categories" });
    fireEvent.click(toggle);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("is just the Shop link when there are no categories yet", () => {
    renderMenu([]);
    expect(screen.queryByRole("button", { name: "Shop categories" })).not.toBeInTheDocument();
  });
});
