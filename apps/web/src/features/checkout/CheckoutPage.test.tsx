import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutPage } from "./CheckoutPage";
import { useCartStore } from "../cart/cart-store";

function renderCheckout(deliveryFeeQar: number | null) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      orderingEnabled: true,
      commercialRegistration: null,
      ecommerceLicense: null,
      businessAddress: null,
      supportEmail: null,
      supportPhone: null,
      deliveryFeeQar,
    }),
  }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><CheckoutPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CheckoutPage delivery details", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useCartStore.setState({ items: [] });
  });

  it("shows local delivery areas, the exact fee, and the full total", async () => {
    useCartStore.setState({
      items: [{ id: "plant-1", slug: "plant", name: "Plant", priceQar: 20, stock: 2, image: null, quantity: 1 }],
    });
    renderCheckout(15);

    expect(await screen.findByRole("option", { name: "Al Khor" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("15 QAR")).toBeInTheDocument();
      expect(screen.getByText("35 QAR")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled();
    });
  });

  it("prevents checkout and explains when delivery pricing is missing", async () => {
    useCartStore.setState({
      items: [{ id: "plant-1", slug: "plant", name: "Plant", priceQar: 20, stock: 2, image: null, quantity: 1 }],
    });
    renderCheckout(null);

    expect(await screen.findByRole("alert")).toHaveTextContent(/delivery pricing is not available/i);
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
  });
});
