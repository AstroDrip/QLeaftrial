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

  it("says delivery is free whatever the basket size, as checkout charges it", async () => {
    useCartStore.setState({ items: [plant(20)] });
    renderCheckout();

    expect(await screen.findByTestId("delivery-note")).toHaveTextContent(/free delivery to Doha, Al Rayyan, Al Wakrah and Al Khor/i);
    expect(screen.queryByText(/more to get free delivery|150 QAR/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toBeEnabled();
  });

  it("places a small order without sending any delivery charge", async () => {
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

  async function fillForm() {
    await userEvent.type(screen.getByPlaceholderText("Aisha Rahman"), "Aisha Rahman");
    await userEvent.type(screen.getByPlaceholderText("+974 5555 1234"), "+974 5555 1234");
    await userEvent.type(screen.getByPlaceholderText("hello@example.com"), "aisha@example.com");
    await userEvent.type(screen.getByPlaceholderText("Villa 12, Street 30"), "Villa 12, Street 30");
    fireEvent.change(screen.getByRole("combobox", { name: /area/i }), { target: { value: "Al Khor" } });
  }

  it("sends one request for a double tap, and the same key when the customer retries after a failure", async () => {
    useCartStore.setState({ items: [plant(20)] });
    let release: (value: unknown) => void = () => undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => { release = () => reject(new TypeError("Failed to fetch")); }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ orderNumber: "QL-20261112-RETRY1", subtotalQar: 20, items: [{ productId: "plant-1", productName: "Plant", quantity: 1, unitPriceQar: 20 }] }),
      });
    renderCheckout(fetchMock);
    await fillForm();

    const button = screen.getByRole("button", { name: "Place order" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByRole("button", { name: /placing your order/i })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release(undefined);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach QLeaves/i);
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));

    await waitFor(() => expect(screen.getByText("Order placed")).toBeInTheDocument());
    const keys = fetchMock.mock.calls.map((call) => (call[1].headers as Record<string, string>)["Idempotency-Key"]);
    expect(keys[0]).toMatch(/^checkout-[\w-]{16,}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("explains a briefly unavailable shop instead of showing a raw error", async () => {
    useCartStore.setState({ items: [plant(20)] });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { code: "DATABASE_UNAVAILABLE", message: "x", requestId: "req_9" } }),
    });
    renderCheckout(fetchMock);
    await fillForm();
    await userEvent.click(screen.getByRole("button", { name: "Place order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/briefly unavailable.*req_9/i);
  });
});
