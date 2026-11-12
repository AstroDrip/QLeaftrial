import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { FloatingCartBar, floatingCartStyle, MINI_AFTER_MS } from "./FloatingCartBar";
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

  it("shows the full banner after an add, folds into the mini banner after a while of browsing, and opens again on the next change", () => {
    vi.useFakeTimers();
    try {
      renderAt("/shop");
      act(() => useCartStore.setState({ items: [item] }));
      const bar = () => screen.getByTestId("floating-cart").closest(".floating-cart")!;
      expect(bar()).toHaveAttribute("data-state", "full");
      expect(screen.getByTestId("free-delivery")).not.toHaveClass("free-delivery--mini");
      expect(screen.getByTestId("floating-cart").querySelector(".floating-cart__badge")).toHaveTextContent("2");

      act(() => { vi.advanceTimersByTime(MINI_AFTER_MS - 100); });
      expect(bar()).toHaveAttribute("data-state", "full");
      act(() => { vi.advanceTimersByTime(200); });
      expect(bar()).toHaveAttribute("data-state", "mini");
      // The mini banner keeps its track and the count.
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(screen.getByTestId("free-delivery")).toHaveClass("free-delivery--mini");
      expect(screen.getByTestId("floating-cart").querySelector(".floating-cart__badge")).toHaveTextContent("2");

      // Hovering opens it while the pointer is there.
      fireEvent.pointerEnter(bar());
      expect(bar()).toHaveAttribute("data-state", "full");
      fireEvent.pointerLeave(bar());
      expect(bar()).toHaveAttribute("data-state", "mini");

      // Adding another item opens the full banner again.
      act(() => useCartStore.setState({ items: [{ ...item, quantity: 3 }] }));
      expect(bar()).toHaveAttribute("data-state", "full");

      // Removing the last item hides it completely.
      act(() => useCartStore.setState({ items: [] }));
      expect(screen.queryByTestId("floating-cart")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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
