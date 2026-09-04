import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";
import { productApi } from "../catalog/product-api";
import { useCartStore } from "../cart/cart-store";

vi.mock("animejs", () => ({
  default: Object.assign(vi.fn(() => ({ pause: vi.fn() })), {
    stagger: vi.fn(() => 0),
    remove: vi.fn(),
    timeline: vi.fn(() => { const chain:any={duration:100,pause:vi.fn(),seek:vi.fn(),add:vi.fn()}; chain.add.mockReturnValue(chain); return chain; }),
  }),
}));
vi.mock("three", () => ({}));
vi.mock("../catalog/product-api", () => ({
  productApi: {
    list: vi.fn(),
    detail: vi.fn(),
    filters: vi.fn(),
  },
}));

describe("HomePage reference choreography", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
    vi.mocked(productApi.list).mockResolvedValue({
      items: [{
        id: "plant-1",
        slug: "house-plant",
        name: "House Plant",
        category: "Indoor",
        light: "Bright indirect",
        priceQar: 215,
        stock: 7,
        inStock: true,
        image: { url: "/house.jpg", altText: "House plant" },
      }],
      page: 1,
      pageSize: 24,
    });
  });
  afterEach(() => { cleanup(); document.documentElement.removeAttribute("data-motion"); });
  function renderHome() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter><HomePage /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("renders the exact editorial journey with live database values", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    renderHome();
    expect(screen.getByRole("heading", { name: /for the love of art and plants/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /shop plants/i })).toHaveAttribute("href", "/shop");
    expect(await screen.findByText("215 QAR")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
  });

  it("adds an API-backed home card to the cart", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    renderHome();

    await userEvent.click(
      await screen.findByRole("button", { name: /add house plant to cart/i }),
    );

    expect(useCartStore.getState().items[0]).toEqual(
      expect.objectContaining({ id: "plant-1", priceQar: 215, stock: 7 }),
    );
  });
});
