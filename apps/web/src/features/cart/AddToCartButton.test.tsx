import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddToCartButton } from "./AddToCartButton";
import { useCartStore } from "./cart-store";

const plant = {
  id: "plant-1",
  slug: "house-plant",
  name: "House Plant",
  category: "Indoor",
  light: "Bright indirect",
  priceQar: 180,
  stock: 2,
  inStock: true,
  image: { url: "/house.jpg", altText: "House plant" },
};

describe("AddToCartButton", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    useCartStore.setState({ items: [] });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("adds through the Zustand cart store, confirms the action, then shows the in-cart quantity", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AddToCartButton product={plant} />);
    expect(screen.getByRole("button")).toHaveTextContent("Add to cart");

    await user.click(screen.getByRole("button", { name: /add house plant to cart/i }));

    expect(useCartStore.getState().items[0]?.quantity).toBe(1);
    expect(screen.getByRole("button")).toHaveTextContent("Added ✓");

    await act(async () => { vi.advanceTimersByTime(1300); });
    expect(screen.getByRole("button")).toHaveTextContent("Add to cart");
    expect(screen.getByText("1", { selector: ".add-to-cart__quantity" })).toBeInTheDocument();
  });

  it("shows Max in cart without reporting a false Added state", async () => {
    useCartStore.setState({ items: [{ ...plant, quantity: 2 }] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AddToCartButton product={plant} />);

    const button = screen.getByRole("button", { name: /maximum stock of house plant is already in cart/i });
    expect(button).toHaveTextContent("Max in cart");
    expect(button).toBeDisabled();
    await user.click(button);
    expect(screen.queryByText("Added ✓")).not.toBeInTheDocument();
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);
  });

  it("shows Out of stock for unavailable products", () => {
    render(<AddToCartButton product={{ ...plant, stock: 0, inStock: false }} />);
    const button = screen.getByRole("button", { name: /house plant is out of stock/i });
    expect(button).toHaveTextContent("Out of stock");
    expect(button).toBeDisabled();
  });

  it("clears a pending confirmation timer when unmounted", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(<AddToCartButton product={plant} />);
    await user.click(screen.getByRole("button"));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("marks reduced-motion mode when the user prefers reduced motion", () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<AddToCartButton product={plant} />);
    expect(screen.getByRole("button")).toHaveAttribute("data-reduced-motion", "true");
  });
});
