import { act, cleanup, render, screen } from "@testing-library/react";
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

  it("stays on screen in a compact idle state while the cart is empty, track included", () => {
    renderAt("/shop");
    const button = screen.getByTestId("floating-cart");
    expect(button).toHaveAccessibleName("Open cart, your cart is empty");
    expect(button.closest(".floating-cart")).toHaveAttribute("data-state", "idle");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByTestId("free-delivery")).toHaveClass("free-delivery--idle");
  });

  it("opens out when a product is added and folds back to idle when the last one is removed", async () => {
    renderAt("/shop");
    act(() => useCartStore.setState({ items: [item] }));
    const button = screen.getByTestId("floating-cart");
    expect(button.closest(".floating-cart")).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("free-delivery")).not.toHaveClass("free-delivery--idle");
    expect(button.querySelector(".floating-cart__badge")).toHaveTextContent("2");
    act(() => useCartStore.setState({ items: [] }));
    expect(screen.getByTestId("floating-cart").closest(".floating-cart")).toHaveAttribute("data-state", "idle");
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("names the action, item count and total for assistive technology", () => {
    useCartStore.setState({ items: [item] });
    renderAt("/shop");
    // 240 QAR is over the free-delivery goal, which the name says too.
    const button = screen.getByRole("link", { name: "Open cart, 2 items, total 240 QAR, free delivery unlocked" });
    expect(button).toHaveAttribute("href", "/cart");
  });

  it("does not claim free delivery below the goal", () => {
    useCartStore.setState({ items: [{ ...item, priceQar: 50, quantity: 1 }] });
    renderAt("/shop");
    expect(screen.getByRole("link", { name: "Open cart, 1 item, total 50 QAR" })).toBeInTheDocument();
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
