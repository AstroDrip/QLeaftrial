import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRef } from "react";
import { FloatingCartBar, floatingCartStyle } from "./FloatingCartBar";
import { useCartStore } from "./cart-store";

const item = { id: "p1", slug: "orchid", name: "Orchid", priceQar: 120, stock: 5, image: null, quantity: 2 };

function renderAt(path: string) {
  const client = new QueryClient();
  client.setQueryData(["storefront-settings"], { orderingEnabled: true });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><FloatingCartBar footer={createRef()} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FloatingCartBar", () => {
  beforeEach(() => useCartStore.setState({ items: [] }));
  afterEach(cleanup);

  it("stays hidden while the cart is empty", () => {
    renderAt("/shop");
    expect(screen.queryByTestId("floating-cart")).not.toBeInTheDocument();
  });

  it("names the action, item count and total for assistive technology", () => {
    useCartStore.setState({ items: [item] });
    renderAt("/shop");
    const button = screen.getByRole("link", { name: "Open cart, 2 items, total 240 QAR" });
    expect(button).toHaveAttribute("href", "/cart");
  });

  it("is not shown on the cart and checkout pages", () => {
    useCartStore.setState({ items: [item] });
    renderAt("/checkout");
    expect(screen.queryByTestId("floating-cart")).not.toBeInTheDocument();
  });

  it("stays out of the way on the customer invoice page", () => {
    useCartStore.setState({ items: [item] });
    renderAt("/invoice/QL-1");
    expect(screen.queryByTestId("floating-cart")).not.toBeInTheDocument();
  });

  it("is fixed before the footer and docks above it once the footer is visible", () => {
    expect(floatingCartStyle({ docked: false, footerHeight: 300 })).toEqual({ className: "floating-cart" });
    expect(floatingCartStyle({ docked: true, footerHeight: 300 })).toEqual({ className: "floating-cart floating-cart--docked", footerHeight: "300px" });
  });
});
