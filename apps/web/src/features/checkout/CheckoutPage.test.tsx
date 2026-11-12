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

  it("below 150 QAR, says the team will confirm the delivery charge and invents no price", async () => {
    useCartStore.setState({ items: [plant(20)] });
    renderCheckout();

    expect(await screen.findByRole("option", { name: "Al Khor" })).toBeInTheDocument();
    expect(screen.getByTestId("delivery-charge-notice")).toHaveTextContent("For orders below QAR 150, our team will contact you to confirm the delivery charge.");
    const summary = screen.getByRole("heading", { name: "Order summary" }).parentElement!;
    expect(summary).toHaveTextContent("DeliveryTo be confirmed");
    expect(summary).toHaveTextContent("Total before delivery20 QAR");
    expect(summary).not.toHaveTextContent(/Free/);
  });

  it("at 149 QAR still shows the notice; at exactly 150 QAR delivery is free and there is no notice", async () => {
    useCartStore.setState({ items: [plant(149)] });
    renderCheckout();
    expect(await screen.findByTestId("delivery-charge-notice")).toBeInTheDocument();
    cleanup();

    useCartStore.setState({ items: [plant(75, 2)] });
    renderCheckout();
    await screen.findByRole("option", { name: "Al Khor" });
    expect(screen.queryByTestId("delivery-charge-notice")).not.toBeInTheDocument();
    const summary = screen.getByRole("heading", { name: "Order summary" }).parentElement!;
    expect(summary).toHaveTextContent("DeliveryFree");
    expect(summary).toHaveTextContent("Total150 QAR");
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
