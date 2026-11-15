import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";
import { productApi } from "../catalog/product-api";
import { useCartStore } from "../cart/cart-store";
import { ApiClientError } from "../../lib/api-error";
import { HOME_BOOTSTRAP_ELEMENT_ID, resetHomeBootstrapForTests } from "./home-bootstrap";

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
  afterEach(() => {
    cleanup();
    document.getElementById(HOME_BOOTSTRAP_ELEMENT_ID)?.remove();
    resetHomeBootstrapForTests();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  function renderHome() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter><HomePage /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("shows the brand promise, categories (without counts) and live new arrivals", async () => {
    renderHome();

    expect(screen.getByRole("heading", { level: 1, name: /for the love of art and plants/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /shop plants/i })).toHaveAttribute("href", "/shop");
    expect(await screen.findByRole("link", { name: /^indoor plants$/i })).toHaveAttribute("href", "/shop?category=Indoor%20Plants");
    expect(await screen.findByText("215 QAR")).toBeInTheDocument();
    expect(productApi.list).toHaveBeenCalledWith(expect.objectContaining({ sort: "newest" }));
  });

  it("adds an API-backed home card to the cart", async () => {
    renderHome();

    await userEvent.click(await screen.findByRole("button", { name: /add house plant to cart/i }));

    expect(useCartStore.getState().items[0]).toEqual(expect.objectContaining({ id: "plant-1", priceQar: 215, stock: 7 }));
  });

  it("reports an API outage without inventing products", async () => {
    vi.mocked(productApi.list).mockRejectedValue(new ApiClientError("The shop is briefly unavailable", "DATABASE_UNAVAILABLE", "req_1", 503));
    renderHome();

    expect(await screen.findByRole("alert")).toHaveTextContent(/briefly unavailable.*Reference: req_1/i);
    expect(screen.queryByRole("button", { name: /add .* to cart/i })).not.toBeInTheDocument();
  });

  // A first-time visitor: nothing saved in the browser, and every request still in flight (or never answering).
  describe("with the bootstrap that ships inside the page", () => {
    const product = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
      id, slug: id, name, nameAr: `${name} عربي`, category: "Indoor Plants", categoryAr: "نباتات داخلية", light: null, lightAr: null,
      priceQar: 120, compareAtPriceQar: null, featured: false, careLevel: null, stock: 3, inStock: true, createdAt: "2026-11-10T00:00:00.000Z",
      image: { url: `/media/${id}.webp`, altText: name, width: 640, height: 800, purpose: "catalogue", sortOrder: 0 },
      description: "", descriptionAr: null, media: [], ...extra,
    });
    function embed(bootstrap: unknown) {
      const element = document.createElement("script");
      element.type = "application/json";
      element.id = HOME_BOOTSTRAP_ELEMENT_ID;
      element.textContent = typeof bootstrap === "string" ? bootstrap : JSON.stringify(bootstrap);
      document.head.append(element);
      resetHomeBootstrapForTests();
    }
    const bootstrap = {
      version: "2026-11-14T20:21:03.609Z", generatedAt: "2026-11-14T20:22:00.000Z", productCount: 40,
      categoryCounts: { "Indoor Plants": 30, "Outdoor Plants": 6, "Pots": 4 }, categoryLabelsAr: { "Indoor Plants": "نباتات داخلية" },
      products: [product("zz-plant", "ZZ Plant", { featured: true }), product("peace-lily", "Peace Lily"), product("potting-soil", "Potting Soil", { category: "Garden Accessories", categoryAr: null })],
    };
    const never = () => new Promise<never>(() => undefined);

    it("shows categories and products at once, before any request has answered", () => {
      vi.mocked(productApi.list).mockImplementation(never);
      vi.mocked(productApi.filters).mockImplementation(never);
      vi.stubGlobal("fetch", vi.fn(never));
      embed(bootstrap);
      renderHome();
      // No waiting: these are on screen in the very first render.
      expect(screen.getByRole("heading", { name: "ZZ Plant" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Peace Lily" })).toBeInTheDocument();
      expect(screen.getAllByText("Indoor Plants").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Pots").length).toBeGreaterThan(0);
      // Garden accessories stay out of New Arrivals here too.
      expect(screen.queryByRole("heading", { name: "Potting Soil" })).not.toBeInTheDocument();
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    it("keeps showing them when the API is down", async () => {
      vi.mocked(productApi.list).mockRejectedValue(new ApiClientError("The shop is briefly unavailable", "DATABASE_UNAVAILABLE", "req_1", 503));
      vi.mocked(productApi.filters).mockRejectedValue(new Error("down"));
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
      embed(bootstrap);
      renderHome();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.getByRole("heading", { name: "ZZ Plant" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("gives way to live products when they arrive", async () => {
      vi.stubGlobal("fetch", vi.fn(never));
      embed(bootstrap);
      renderHome();
      expect(await screen.findByRole("heading", { name: "House Plant" })).toBeInTheDocument();
    });

    it("ignores a damaged bootstrap and loads the usual way", async () => {
      vi.stubGlobal("fetch", vi.fn(never));
      embed("{ not json");
      renderHome();
      expect(await screen.findByRole("heading", { name: "House Plant" })).toBeInTheDocument();
    });
  });
});
