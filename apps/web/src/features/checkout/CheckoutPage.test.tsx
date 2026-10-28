import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckoutPage } from "./CheckoutPage";
import { useCartStore } from "../cart/cart-store";

const plant = (priceQar: number, quantity = 1) => ({ id: "plant-1", slug: "plant", name: "Plant", priceQar, stock: 20, image: null, quantity });

function renderCheckout(fetchMock = vi.fn()) {
  vi.stubGlobal("fetch", fetchMock);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/checkout"]}>
        <Routes>
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order/:orderNumber" element={<p>Order placed</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CheckoutPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useCartStore.setState({ items: [] });
  });

  it("shows the delivery areas and a total with no delivery charge", async () => {
    useCartStore.setState({ items: [plant(20)] });
    renderCheckout();

    expect(await screen.findByRole("option", { name: "Al Khor" })).toBeInTheDocument();
    expect(screen.queryByText(/delivery charge/i)).not.toBeInTheDocument();
    const summary = screen.getByRole("heading", { name: "Order summary" }).parentElement!;
    expect(summary).toHaveTextContent("Total20 QAR");
  });

  it("encourages a bigger basket for free delivery but still lets a small order through", async () => {
    useCartStore.setState({ items: [plant(20)] });
    renderCheckout();

    expect(await screen.findByText("Add 130 QAR more to get free delivery")).toBeInTheDocument();
    expect(screen.getByText("Free delivery on orders of 150 QAR or more")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled();
  });

  it("tells the customer when they have unlocked free delivery", async () => {
    useCartStore.setState({ items: [plant(75, 2)] });
    renderCheckout();

    expect(await screen.findByText("You\u2019ve unlocked free delivery!")).toBeInTheDocument();
  });

  it("places an order below the free-delivery amount without sending any delivery charge", async () => {
    useCartStore.setState({ items: [plant(20)] });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ orderNumber: "QL-20261028-AAA111", subtotalQar: 20, deliveryFeeQar: 0, items: [{ productId: "plant-1", productName: "Plant", quantity: 1, unitPriceQar: 20 }] }),
    });
    renderCheckout(fetchMock);

    await userEvent.type(screen.getByPlaceholderText("Aisha Rahman"), "Aisha Rahman");
    await userEvent.type(screen.getByPlaceholderText("+974 5555 1234"), "+974 5555 1234");
    await userEvent.type(screen.getByPlaceholderText("hello@example.com"), "aisha@example.com");
    await userEvent.type(screen.getByPlaceholderText("Villa 12, Street 30"), "Villa 12, Street 30");
    fireEvent.change(screen.getByRole("combobox", { name: /area/i }), { target: { value: "Al Khor" } });
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));

    await waitFor(() => expect(screen.getByText("Order placed")).toBeInTheDocument());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("deliveryFeeQar");
    expect(body.items).toEqual([{ productId: "plant-1", quantity: 1 }]);
  });
});
