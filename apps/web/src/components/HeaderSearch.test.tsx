import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeaderSearch } from "./HeaderSearch";
import { productApi } from "../features/catalog/product-api";

vi.mock("../features/catalog/product-api", () => ({ productApi: { list: vi.fn(), detail: vi.fn(), filters: vi.fn() } }));

function Location() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}{location.search}</p>;
}

function renderSearch() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/"]}>
        <HeaderSearch />
        <Routes><Route path="*" element={<Location />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("HeaderSearch", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("suggests matching plants while typing", async () => {
    vi.mocked(productApi.list).mockResolvedValue({
      items: [{ id: "1", slug: "orchid", name: "Orchid", category: "Gift Plants", light: "Bright indirect", priceQar: 120, stock: 3, inStock: true, image: null }],
      page: 1, pageSize: 24, totalItems: 1, totalPages: 1,
    });
    renderSearch();

    await userEvent.type(screen.getByRole("combobox", { name: "Search plants" }), "orc");

    expect(await screen.findByRole("option", { name: /orchid/i })).toBeInTheDocument();
    expect(productApi.list).toHaveBeenCalledWith(expect.objectContaining({ q: "orc" }));
  });

  it("opens the shop with the search term on Enter", async () => {
    vi.mocked(productApi.list).mockResolvedValue({ items: [], page: 1, pageSize: 24, totalItems: 0, totalPages: 0 });
    renderSearch();

    await userEvent.type(screen.getByRole("combobox", { name: "Search plants" }), "palm{Enter}");

    expect(screen.getByTestId("location")).toHaveTextContent("/shop?q=palm");
  });
});
