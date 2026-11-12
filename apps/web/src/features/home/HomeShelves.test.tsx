import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localeContent as content } from "../../content/locales";
import type { CatalogueProduct } from "../catalog/catalogue-types";
import { productApi } from "../catalog/product-api";
import { HomePage } from "./HomePage";

vi.mock("../catalog/product-api", () => ({ productApi: { list: vi.fn(), detail: vi.fn(), filters: vi.fn() } }));
vi.mock("../reviews/review-api", () => ({ reviewApi: { list: vi.fn().mockResolvedValue([]) } }));

const plant = (id: string, overrides: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  id, slug: id, name: `Plant ${id}`, nameAr: null, description: "", descriptionAr: null, category: "Indoor Plants", categoryAr: null,
  light: "Bright indirect", lightAr: null, priceQar: 50, stock: 5, inStock: true, createdAt: `2026-11-${10 + Number(id.replace(/\D/g, "")) % 10}T00:00:00.000Z`,
  image: null, media: [], ...overrides,
});

function renderHome(products: CatalogueProduct[]) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ version: "v1", generatedAt: "", productCount: products.length, products }) } as Response)));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><HomePage /></MemoryRouter></QueryClientProvider>);
}

const names = (id: string) => within(screen.getByTestId(`shelf-${id}`)).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);

describe("home page shelves", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(productApi.list).mockReturnValue(new Promise(() => undefined));
    vi.mocked(productApi.filters).mockReturnValue(new Promise(() => undefined));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("fills Featured, Offers and discovery shelves from real product data, each product on one shelf only", async () => {
    renderHome([
      plant("p1", { featured: true }),
      plant("p2", { compareAtPriceQar: 70 }),
      plant("p3", { careLevel: "easy" }), plant("p4", { careLevel: "easy" }),
      plant("p5", { light: "Low to bright indirect" }), plant("p6", { light: "Low to bright indirect" }),
      plant("p7", { compareAtPriceQar: 40 }), // not a real reduction: never an offer
    ]);

    expect(await screen.findByTestId("shelf-featured")).toBeInTheDocument();
    expect(names("featured")).toEqual(["Plant p1"]);
    const shelves = ["featured", "new", "offers", "easy", "low-light"].filter((id) => screen.queryByTestId(`shelf-${id}`));
    const all = shelves.flatMap(names);
    expect(new Set(all).size).toBe(all.length);
  });

  it("shows category tiles without product counts, and marks an empty category as coming soon", async () => {
    renderHome([plant("p1"), plant("p2", { category: "Outdoor Plants" })]);
    const indoor = await screen.findByRole("link", { name: /Indoor Plants/ });
    expect(indoor).not.toHaveTextContent(/product/);
    const counts = [...document.querySelectorAll(".home-categories li:not([aria-hidden]) .home-categories__count")].map((node) => node.textContent);
    expect(counts.every((text) => text === "Coming soon")).toBe(true);
    expect(counts.length).toBeGreaterThan(0);
  });

  it("keeps garden accessories out of New Arrivals, in either language", async () => {
    vi.mocked(productApi.list).mockResolvedValue({
      items: [
        { id: "a1", slug: "fertiliser", name: "Fertiliser", nameAr: null, category: "Garden Accessories", categoryAr: "مستلزمات الحديقة", light: null, lightAr: null, priceQar: 30, compareAtPriceQar: null, featured: false, scientificName: null, careLevel: null, placement: null, createdAt: "2026-11-20T00:00:00.000Z", stock: 5, inStock: true, image: null, media: [] },
        { id: "a2", slug: "soil", name: "Soil", nameAr: null, category: "مستلزمات الحديقة", categoryAr: "مستلزمات الحديقة", light: null, lightAr: null, priceQar: 20, compareAtPriceQar: null, featured: false, scientificName: null, careLevel: null, placement: null, createdAt: "2026-11-19T00:00:00.000Z", stock: 5, inStock: true, image: null, media: [] },
        { id: "p9", slug: "p9", name: "Plant p9", nameAr: null, category: "Indoor Plants", categoryAr: null, light: null, lightAr: null, priceQar: 50, compareAtPriceQar: null, featured: false, scientificName: null, careLevel: null, placement: null, createdAt: "2026-11-18T00:00:00.000Z", stock: 5, inStock: true, image: null, media: [] },
      ],
      page: 1, pageSize: 24, totalItems: 3, totalPages: 1,
    });
    renderHome([plant("p9")]);
    expect(await screen.findByTestId("shelf-new")).toBeInTheDocument();
    expect(names("new")).toEqual(["Plant p9"]);
  });

  it("draws no Featured or Offers shelf when no product qualifies, instead of inventing one", async () => {
    renderHome([plant("p1"), plant("p2", { compareAtPriceQar: 50 })]);

    expect(await screen.findByTestId("shelf-new")).toBeInTheDocument();
    expect(screen.queryByTestId("shelf-featured")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shelf-offers")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shelf-easy")).not.toBeInTheDocument();
  });

  it("shows the shop's own About us introduction word for word", async () => {
    renderHome([plant("p1")]);
    const about = await screen.findByRole("heading", { name: content.en.legal.about.title });
    expect(about.parentElement).toHaveTextContent(content.en.legal.about.introduction);
    expect(screen.getByRole("link", { name: "More about QLeaves" })).toHaveAttribute("href", "/about");
  });
});
