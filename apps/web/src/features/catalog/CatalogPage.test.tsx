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
import { CatalogPage } from "./CatalogPage";
import { productApi } from "./product-api";
import type { ProductSummary } from "./product-types";
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
    });

    renderWithClient(<CatalogPage />);

    await waitFor(() =>
      expect(screen.getByTestId("product-grid")).toBeInTheDocument(),
    );
    expect(screen.getByText("House Plant")).toBeInTheDocument();
    expect(screen.getByText("180 QAR")).toBeInTheDocument();
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
    mockList.mockResolvedValue({ items: [], page: 1, pageSize: 24 });

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
});
