import type { ReactElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../../app/providers";
import { LanguageToggle } from "../../components/LanguageToggle";
import { CatalogPage } from "./CatalogPage";
import { productApi } from "./product-api";
import type { ProductListResponse, ProductSummary } from "./product-types";
import { useCartStore } from "../cart/cart-store";

vi.mock("./product-api", () => ({
  productApi: {
    list: vi.fn(),
    detail: vi.fn(),
    filters: vi.fn(),
  },
}));

const mockList = vi.mocked(productApi.list);
const mockFilters = vi.mocked(productApi.filters);

function createTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
}

function renderWithClient(ui: ReactElement) {
  const client = createTestClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CatalogPage", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
    mockFilters.mockResolvedValue({
      categories: ["Indoor", "Succulent"],
      lights: ["Bright indirect", "Direct sun"],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("renders a loading state while products fetch", () => {
    mockList.mockImplementation(() => new Promise(() => {}));
    renderWithClient(<CatalogPage />);

    expect(screen.getByTestId("catalog-loading")).toBeInTheDocument();
  });

  it("renders products once fetched", async () => {
    mockList.mockResolvedValue({
      items: [
        {
          id: "1",
          slug: "house-plant",
          name: "House Plant",
          category: "Indoor",
          light: "Bright indirect",
          priceQar: 180,
          stock: 12,
          inStock: true,
          image: { url: "/house.jpg", altText: "House plant" },
        },
      ],
      page: 1,
      pageSize: 24,
      totalItems: 1,
      totalPages: 1,
    });

    renderWithClient(<CatalogPage />);

    await waitFor(() =>
      expect(screen.getByTestId("product-grid")).toBeInTheDocument(),
    );
    expect(screen.getByText("House Plant")).toBeInTheDocument();
    expect(screen.getByText("180 QAR")).toBeInTheDocument();
  });

  it("does not show Arabic catalogue data as a placeholder after switching to English", async () => {
    localStorage.setItem("qleaves-language", "ar");
    const arabicProducts: ProductListResponse = {
      items: [{
        id: "1", slug: "house-plant", name: "نبات منزلي", category: "داخلي",
        light: "إضاءة ساطعة غير مباشرة", priceQar: 180, stock: 12, inStock: true, image: null,
      }],
      page: 1, pageSize: 24, totalItems: 1, totalPages: 1,
    };
    let completeEnglishRequest: ((response: ProductListResponse) => void) | undefined;
    mockList.mockImplementation((params) => params.lang === "ar"
      ? Promise.resolve(arabicProducts)
      : new Promise((resolve) => { completeEnglishRequest = resolve; }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderingEnabled: true,
        commercialRegistration: null,
        ecommerceLicense: null,
        businessAddress: null,
        supportEmail: null,
        supportPhone: null,
        deliveryFeeQar: null,
      }),
    }));

    render(
      <Providers>
        <MemoryRouter>
          <LanguageToggle />
          <CatalogPage />
        </MemoryRouter>
      </Providers>,
    );

    expect(await screen.findByText("نبات منزلي")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "تبديل اللغة" }));

    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ lang: "en" })));
    expect(screen.queryByText("نبات منزلي")).not.toBeInTheDocument();
    expect(screen.getByTestId("catalog-loading")).toBeInTheDocument();

    completeEnglishRequest?.({
      items: [{
        id: "1", slug: "house-plant", name: "House Plant", category: "Indoor",
        light: "Bright indirect", priceQar: 180, stock: 12, inStock: true, image: null,
      }],
      page: 1, pageSize: 24, totalItems: 1, totalPages: 1,
    });
    expect(await screen.findByText("House Plant")).toBeInTheDocument();
  });

  it("hides prices, cart controls, and price sorting when ordering is disabled", async () => {
    mockList.mockResolvedValue({
      items: [
        {
          id: "1",
          slug: "house-plant",
          name: "House Plant",
          category: "Indoor",
          light: "Bright indirect",
          priceQar: 180,
          stock: 12,
          inStock: true,
          image: { url: "/house.jpg", altText: "House plant" },
        },
      ],
      page: 1,
      pageSize: 24,
      totalItems: 1,
      totalPages: 1,
    });
    const client = createTestClient();
    client.setQueryData(["storefront-settings"], { orderingEnabled: false });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><CatalogPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByTestId("product-grid");
    expect(screen.queryByText("180 QAR")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add house plant to cart/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("sort-select").querySelectorAll("option")).toHaveLength(1);
  });

  it("adds the selected in-stock catalogue product to the cart", async () => {
    mockList.mockResolvedValue({
      items: [
        {
          id: "1",
          slug: "house-plant",
          name: "House Plant",
          category: "Indoor",
          light: "Bright indirect",
          priceQar: 180,
          stock: 12,
          inStock: true,
          image: { url: "/house.jpg", altText: "House plant" },
        },
      ],
      page: 1,
      pageSize: 24,
      totalItems: 1,
      totalPages: 1,
    });

    renderWithClient(<CatalogPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: /add house plant to cart/i }),
    );

    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ id: "1", quantity: 1 }),
    ]);
  });

  it("renders an empty state when no products match", async () => {
    mockList.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 24,
      totalItems: 0,
      totalPages: 0,
    });

    renderWithClient(<CatalogPage />);

    await waitFor(() => screen.findByTestId("catalog-empty"));
    expect(screen.getByTestId("catalog-empty")).toHaveTextContent(
      /no plants matched/i,
    );
  });

  it("renders an error state on fetch failure", async () => {
    mockList.mockRejectedValue(new Error("Network down"));

    renderWithClient(<CatalogPage />);

    await waitFor(() => screen.findByTestId("catalog-error"));
    expect(screen.getByRole("alert")).toHaveTextContent(/network down/i);
  });

  it("applies a category filter on change", async () => {
    mockList.mockResolvedValue({
      items: [] as ProductSummary[],
      page: 1,
      pageSize: 24,
      totalItems: 0,
      totalPages: 0,
    });

    renderWithClient(<CatalogPage />);

    await waitFor(() => expect(mockFilters).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Indoor" })).toBeInTheDocument(),
    );

    const category = screen.getByTestId("category-filter");
    await userEvent.selectOptions(category, "Indoor");
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ category: "Indoor" }),
      ),
    );
  });

  it("shows real pagination on page one and requests the next page", async () => {
    mockList.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 24,
      totalItems: 25,
      totalPages: 2,
    });

    renderWithClient(<CatalogPage />);

    const next = await screen.findByRole("button", { name: "Next" });
    await userEvent.click(next);

    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })),
    );
  });

  it("replaces a failed product image with the local plant fallback", async () => {
    mockList.mockResolvedValue({
      items: [{
        id: "1",
        slug: "house-plant",
        name: "House Plant",
        category: "Indoor",
        light: "Bright indirect",
        priceQar: 180,
        stock: 12,
        inStock: true,
        image: { url: "/media/plants/missing.jpg", altText: "House plant" },
      }],
      page: 1,
      pageSize: 24,
      totalItems: 1,
      totalPages: 1,
    });

    renderWithClient(<CatalogPage />);
    const image = await screen.findByRole("img", { name: "House plant" });
    fireEvent.error(image);

    expect(image).toHaveAttribute("src", "/images/hero/leaf-1.svg");
  });
});
