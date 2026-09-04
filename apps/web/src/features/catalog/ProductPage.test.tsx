import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCartStore } from "../cart/cart-store";
import { productApi } from "./product-api";
import { ProductPage } from "./ProductPage";

vi.mock("./product-api", () => ({
  productApi: {
    detail: vi.fn(),
    list: vi.fn(),
    filters: vi.fn(),
  },
}));

describe("ProductPage cart action", () => {
  afterEach(cleanup);
  beforeEach(() => {
    document.head.querySelectorAll("[data-qleaves-seo]").forEach((node) => node.remove());
    useCartStore.setState({ items: [] });
    vi.mocked(productApi.detail).mockResolvedValue({
      id: "plant-1",
      slug: "house-plant",
      name: "House Plant",
      description: "Glossy foliage.",
      category: "Indoor",
      light: "Bright indirect",
      priceQar: 180,
      stock: 12,
      inStock: true,
      image: { url: "/house.jpg", altText: "House plant" },
      media: [{ url: "/house.jpg", altText: "House plant" }],
    });
  });

  it("adds the displayed product to the persisted cart", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/plants/house-plant"]}>
          <Routes>
            <Route path="/plants/:slug" element={<ProductPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /add house plant to cart/i }),
    );

    expect(useCartStore.getState().items[0]).toEqual(
      expect.objectContaining({ id: "plant-1", quantity: 1 }),
    );
  });

  it("publishes live Product and Offer structured data", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/plants/house-plant"]}><Routes><Route path="/plants/:slug" element={<ProductPage />} /></Routes></MemoryRouter></QueryClientProvider>);
    await screen.findByRole("heading", { name: "House Plant" });
    await waitFor(() => expect(document.head.querySelector('script[data-qleaves-seo][type="application/ld+json"]')).toBeInTheDocument());
    const jsonLd = document.head.querySelector('script[data-qleaves-seo][type="application/ld+json"]')?.textContent ?? "";
    expect(jsonLd).toContain('"@type":"Product"');
    expect(jsonLd).toContain('"priceCurrency":"QAR"');
    expect(jsonLd).toContain('"price":180');
  });
});
