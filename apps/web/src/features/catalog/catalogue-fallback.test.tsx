import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../lib/api-error";
import { HomePage } from "../home/HomePage";
import { CatalogPage } from "./CatalogPage";
import { CATALOGUE_STORAGE_KEY, fetchCatalogue, readCachedCatalogue } from "./catalogue-client";
import { catalogueListResponse } from "./catalogue-view";
import type { CatalogueProduct, CatalogueSnapshot } from "./catalogue-types";
import { productApi } from "./product-api";

// The storefront must still show products when the live product API (or the database behind it) is down.

vi.mock("./product-api", () => ({ productApi: { list: vi.fn(), detail: vi.fn(), filters: vi.fn() } }));
vi.mock("../reviews/review-api", () => ({ reviewApi: { list: vi.fn().mockResolvedValue([]) } }));

const product = (overrides: Partial<CatalogueProduct>): CatalogueProduct => ({
  id: "p", slug: "p", name: "P", nameAr: null, description: "", descriptionAr: null,
  category: "Indoor Plants", categoryAr: "نباتات داخلية", light: null, lightAr: null,
  priceQar: 100, stock: 3, inStock: true, createdAt: "2026-11-01T00:00:00.000Z", image: null, media: [], ...overrides,
});

const snapshot: CatalogueSnapshot = {
  version: "2026-11-10T00:00:00.000Z",
  generatedAt: "2026-11-10T00:00:00.000Z",
  productCount: 3,
  products: [
    product({ id: "a", slug: "monstera", name: "Monstera", nameAr: "مونستيرا", priceQar: 150, createdAt: "2026-11-03T00:00:00.000Z" }),
    product({ id: "b", slug: "pothos", name: "Pothos", priceQar: 60, createdAt: "2026-11-05T00:00:00.000Z" }),
    product({ id: "c", slug: "bougainvillea", name: "Bougainvillea", category: "Outdoor Plants", categoryAr: "نباتات خارجية", priceQar: 90, inStock: false, stock: 0 }),
  ],
};

function respond(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => body } as Response);
}

function render_(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

const outage = new ApiClientError("The shop is briefly unavailable", "DATABASE_UNAVAILABLE", "req_1", 503);

describe("the saved catalogue", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear(); });

  it("prefers the live catalogue, falls back to the build snapshot, and remembers the last good copy", async () => {
    const fetchMock = vi.fn((url: string) => (url === "/api/v1/catalogue" ? respond(snapshot) : respond({}, false, 404)));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchCatalogue()).source).toBe("live");
    expect(readCachedCatalogue()?.snapshot.version).toBe(snapshot.version);

    fetchMock.mockImplementation((url: string) => (url === "/api/v1/catalogue" ? respond({ error: {} }, false, 503) : respond({ ...snapshot, version: "2026-11-01T00:00:00.000Z" })));
    // The older build snapshot never replaces the newer copy this browser already has.
    const fallback = await fetchCatalogue();
    expect(fallback.source).toBe("snapshot");
    expect(fallback.version).toBe(snapshot.version);
  });

  it("ignores a saved copy that is more than a week old, or unreadable", () => {
    localStorage.setItem(CATALOGUE_STORAGE_KEY, JSON.stringify({ snapshot, savedAt: Date.now() - 8 * 24 * 3600 * 1000 }));
    expect(readCachedCatalogue()).toBeNull();
    localStorage.setItem(CATALOGUE_STORAGE_KEY, "{not json");
    expect(readCachedCatalogue()).toBeNull();
  });

  it("answers a shop query exactly like the API: filters, Arabic search, newest first, real counts", () => {
    const newest = catalogueListResponse(snapshot.products, { page: 1, sort: "newest", lang: "en" });
    expect(newest.items.map((item) => item.slug)).toEqual(["pothos", "monstera", "bougainvillea"]);
    expect(catalogueListResponse(snapshot.products, { q: "مونستيرا", lang: "ar" }).items.map((item) => item.name)).toEqual(["مونستيرا"]);
    expect(catalogueListResponse(snapshot.products, { category: "Indoor Plants", inStock: "1", maxPrice: 100 }).totalItems).toBe(1);
  });

  it("keeps the shop browsable when the live list fails, and says the prices are confirmed at checkout", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond(snapshot)));
    vi.mocked(productApi.list).mockRejectedValue(outage);
    vi.mocked(productApi.filters).mockRejectedValue(outage);

    render_(<CatalogPage />);

    const grid = await screen.findByTestId("product-grid");
    expect(within(grid).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Pothos", "Monstera", "Bougainvillea"]);
    expect(await screen.findByTestId("catalog-saved")).toHaveTextContent(/confirmed at checkout/i);
    expect(screen.queryByTestId("catalog-error")).not.toBeInTheDocument();
    // Categories come from the saved products, with their real counts.
    expect(screen.getByRole("button", { name: /Outdoor Plants/ })).toBeEnabled();
  });

  it("fills the home page from the saved catalogue during an outage, without invented counts", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond(snapshot)));
    vi.mocked(productApi.list).mockRejectedValue(outage);
    vi.mocked(productApi.filters).mockRejectedValue(outage);

    render_(<HomePage />);

    expect(await screen.findByRole("heading", { name: "Pothos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monstera" })).toBeInTheDocument();
    const indoor = screen.getAllByRole("link", { name: /Indoor Plants/ })[0];
    expect(indoor).toHaveTextContent(/2 products/);
    expect(screen.queryByText(/briefly unavailable/i)).not.toBeInTheDocument();
  });

  it("shows the outage message only when there is nothing saved to show", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond({}, false, 503)));
    vi.mocked(productApi.list).mockRejectedValue(outage);
    vi.mocked(productApi.filters).mockRejectedValue(outage);

    render_(<HomePage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/briefly unavailable/i);
  });
});
