import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

async function openSearch() {
  await userEvent.click(screen.getByRole("button", { name: "Search plants" }));
  return screen.getByRole("combobox", { name: "Search plants" });
}

describe("HeaderSearch", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("suggests matching plants while typing", async () => {
    vi.mocked(productApi.list).mockResolvedValue({
      items: [{ id: "1", slug: "orchid", name: "Orchid", category: "Gift Plants", light: "Bright indirect", priceQar: 120, stock: 3, inStock: true, image: null }],
      page: 1, pageSize: 24, totalItems: 1, totalPages: 1,
    });
    renderSearch();

    await userEvent.type(await openSearch(), "orc");

    expect(await screen.findByRole("option", { name: /orchid/i })).toBeInTheDocument();
    expect(productApi.list).toHaveBeenCalledWith(expect.objectContaining({ q: "orc" }));
  });

  it("opens the shop with the search term on Enter", async () => {
    vi.mocked(productApi.list).mockResolvedValue({ items: [], page: 1, pageSize: 24, totalItems: 0, totalPages: 0 });
    renderSearch();

    await userEvent.type(await openSearch(), "palm{Enter}");

    expect(screen.getByTestId("location")).toHaveTextContent("/shop?q=palm");
  });

  it("starts as an icon, opens on press and closes on Escape", async () => {
    renderSearch();
    const toggle = screen.getByRole("button", { name: "Search plants" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("combobox", { name: "Search plants" })).toHaveAttribute("tabindex", "-1");

    await userEvent.click(toggle);

    const field = screen.getByRole("combobox", { name: "Search plants" });
    expect(screen.getByRole("button", { name: "Close search" })).toHaveAttribute("aria-expanded", "true");
    expect(field).toHaveAttribute("tabindex", "0");
    await waitFor(() => expect(field).toHaveFocus());

    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Search plants" })).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when focus leaves without a target and closes when tabbing away", async () => {
    renderSearch();
    const field = await openSearch();

    fireEvent.blur(field, { relatedTarget: null });
    expect(screen.getByRole("button", { name: "Close search" })).toBeInTheDocument();

    fireEvent.blur(field, { relatedTarget: document.body });
    expect(screen.getByRole("button", { name: "Search plants" })).toBeInTheDocument();
  });
});
