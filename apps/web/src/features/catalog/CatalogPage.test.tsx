import type { ReactElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
    window.localStorage.removeItem("qleaves-language");
    useCartStore.setState({ items: [] });
    vi.mocked(productApi.detail).mockResolvedValue({
      id: "1",
      slug: "house-plant",
      name: "House Plant",
      description: "Glossy foliage.",
      category: "Indoor",
      light: "Bright indirect",
      priceQar: 180,
      stock: 12,
      inStock: true,
      image: null,
      media: [],
    });
    mockFilters.mockResolvedValue({
      categories: ["Indoor", "Succulent"],
      lights: ["Bright indirect", "Direct sun"],
    });
  });

  it("renders Arabic product and filter copy after switching languages", async () => {
    mockFilters.mockResolvedValue({ categories: ["Indoor"], lights: ["Bright indirect"], categoryLabels: { Indoor: "نباتات داخلية" }, lightLabels: { "Bright indirect": "إضاءة ساطعة غير مباشرة" } });
    mockList.mockResolvedValue({ items: [{ id: "1", slug: "house-plant", name: "House Plant", nameAr: "نبات منزلي", category: "Indoor", categoryAr: "نباتات داخلية", light: "Bright indirect", lightAr: "إضاءة ساطعة غير مباشرة", priceQar: 180, stock: 12, inStock: true, image: null }], page: 1, pageSize: 24, totalItems: 1, totalPages: 1 });
    render(<Providers><MemoryRouter><LanguageToggle /><CatalogPage /></MemoryRouter></Providers>);

    await userEvent.click(screen.getByTestId("language-toggle"));

    expect(await screen.findByRole("heading", { name: "نبات منزلي" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "نباتات داخلية" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أضف نبات منزلي إلى السلة" })).toBeInTheDocument();
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
      <Providers client={createTestClient()}>
        <MemoryRouter>
          <LanguageToggle />
          <CatalogPage />
        </MemoryRouter>
      </Providers>,
    );

    expect(await screen.findByText("نبات منزلي")).toBeInTheDocument();
    const languageToggle = screen.getByTestId("language-toggle").querySelector("input");
    expect(languageToggle).not.toBeNull();
    await userEvent.click(languageToggle!);

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
    const sortValues = [...screen.getByTestId("sort-select").querySelectorAll("option")].map((option) => option.value);
    expect(sortValues).toEqual(["newest", "name-asc"]);
    expect(screen.queryByTestId("price-filter")).not.toBeInTheDocument();
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
    // A network failure reads as a connection problem, not as a raw "Network down" or "Failed to fetch".
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't reach QLeaves/i);
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
    const category = await screen.findByRole("button", { name: "Indoor" });
    await userEvent.click(category);
    expect(category).toHaveAttribute("aria-pressed", "true");
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

  it("lists categories with counts in the sidebar and filters by price and stock", async () => {
    mockFilters.mockResolvedValue({ categories: ["Indoor Plants", "Outdoor Plants"], lights: [], categoryCounts: { "Indoor Plants": 8, "Outdoor Plants": 4 } });
    mockList.mockResolvedValue({ items: [], page: 1, pageSize: 24, totalItems: 0, totalPages: 0 });
    renderWithClient(<CatalogPage />);

    const list = await screen.findByTestId("category-filter");
    expect(await within(list).findByRole("button", { name: /all categories\s*12/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(list).getByRole("button", { name: /indoor plants\s*8/i })).toBeInTheDocument();

    const toggle = screen.getByRole("button", { expanded: false });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(within(list).getByRole("button", { name: /indoor plants/i }));
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.selectOptions(screen.getByTestId("price-filter"), "50-100");
    await userEvent.click(screen.getByTestId("in-stock-filter"));
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ minPrice: 50, maxPrice: 100, inStock: "1" })));
  });

  it("displays an error state with a retry button and allows recovery without losing filters", async () => {
    mockList.mockRejectedValueOnce(new Error("Connection failed. Please check your network and try again."));
    renderWithClient(<CatalogPage />);

    expect(await screen.findByTestId("catalog-error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/check your connection/i);

    const retryButton = screen.getByTestId("catalog-retry");
    expect(retryButton).toBeInTheDocument();

    mockList.mockResolvedValueOnce({
      items: [{
        id: "1",
        slug: "house-plant",
        name: "House Plant",
        category: "Indoor",
        light: "Bright indirect",
        priceQar: 180,
        stock: 12,
        inStock: true,
        image: null,
      }],
      page: 1,
      pageSize: 24,
      totalItems: 1,
      totalPages: 1,
    });

    await userEvent.click(retryButton);
    expect(await screen.findByRole("heading", { name: "House Plant" })).toBeInTheDocument();
  });
});
