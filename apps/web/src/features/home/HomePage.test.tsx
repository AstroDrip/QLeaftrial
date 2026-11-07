import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";
import { productApi } from "../catalog/product-api";
import { useCartStore } from "../cart/cart-store";

vi.mock("../reviews/review-api", () => ({ reviewApi: { list: vi.fn().mockResolvedValue([]) } }));

vi.mock("../catalog/product-api", () => ({
  productApi: {
    list: vi.fn(),
    detail: vi.fn(),
    filters: vi.fn(),
  },
}));

describe("HomePage", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
    vi.mocked(productApi.filters).mockResolvedValue({
      categories: ["Indoor Plants", "Outdoor Plants"],
      lights: [],
      categoryCounts: { "Indoor Plants": 8, "Outdoor Plants": 4 },
    });
    vi.mocked(productApi.list).mockResolvedValue({
      items: [{
        id: "plant-1",
        slug: "house-plant",
        name: "House Plant",
        category: "Indoor Plants",
        light: "Bright indirect",
        priceQar: 215,
        stock: 7,
        inStock: true,
        image: { url: "/house.jpg", altText: "House plant" },
      }],
      page: 1,
      pageSize: 24,
      totalItems: 1,
      totalPages: 1,
    });
  });
  afterEach(cleanup);

  function renderHome() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter><HomePage /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("shows the brand promise, categories with counts and live new arrivals", async () => {
    renderHome();

    expect(screen.getByRole("heading", { level: 1, name: /for the love of art and plants/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /shop plants/i })).toHaveAttribute("href", "/shop");
    expect(await screen.findByRole("link", { name: /indoor plants\s*8 products/i })).toHaveAttribute("href", "/shop?category=Indoor%20Plants");
    expect(await screen.findByText("215 QAR")).toBeInTheDocument();
    expect(productApi.list).toHaveBeenCalledWith(expect.objectContaining({ sort: "newest" }));
  });

  it("adds an API-backed home card to the cart", async () => {
    renderHome();

    await userEvent.click(await screen.findByRole("button", { name: /add house plant to cart/i }));

    expect(useCartStore.getState().items[0]).toEqual(expect.objectContaining({ id: "plant-1", priceQar: 215, stock: 7 }));
  });

  it("reports an API outage without inventing products", async () => {
    vi.mocked(productApi.list).mockRejectedValue(new Error("API unavailable"));
    renderHome();

    expect(await screen.findByRole("alert")).toHaveTextContent(/API unavailable/i);
    expect(screen.queryByRole("button", { name: /add .* to cart/i })).not.toBeInTheDocument();
  });
});
