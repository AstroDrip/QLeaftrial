import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminProductsPage } from "./AdminProductsPage";
import { adminApi } from "./admin-api";

vi.mock("./admin-api", () => ({
  adminApi: { login: vi.fn(), session: vi.fn(), logout: vi.fn(), products: vi.fn(), updateProduct: vi.fn(), createProduct: vi.fn() },
}));

const product = {
  id: "plant-1", slug: "monstera", name: "Monstera", category: "Indoor",
  description: "A lovely plant for your home.", light: "Bright indirect",
  priceQar: 180, stock: 14, inStock: true, image: null,
};

describe("AdminProductsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(adminApi.products).mockResolvedValue([product]);
    vi.mocked(adminApi.updateProduct).mockImplementation(async (_id, patch) => ({ ...product, ...patch }));
  });
  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync();
    cleanup();
    vi.useRealTimers();
  });

  it("autosaves integer stock and QAR price edits", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);

    const stock = await screen.findByRole("spinbutton", { name: /monstera stock/i });
    const price = screen.getByRole("spinbutton", { name: /monstera price/i });
    await user.clear(stock);
    await user.type(stock, "19");
    await user.clear(price);
    await user.type(price, "205");
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(adminApi.updateProduct).toHaveBeenCalledWith("plant-1", { stock: 19 });
    expect(adminApi.updateProduct).toHaveBeenCalledWith("plant-1", { priceQar: 205 });
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  it("does not turn a temporarily empty field into zero", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    const stock = await screen.findByRole("spinbutton", { name: /monstera stock/i });
    vi.mocked(adminApi.updateProduct).mockClear();
    await user.clear(stock);
    await user.tab();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(adminApi.updateProduct).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/stock must be a non-negative whole number/i);
  });

  it("keeps a failed field visible after a different field saves", async () => {
    vi.mocked(adminApi.updateProduct).mockImplementation(async (_id, patch) => {
      if (patch.stock !== undefined) throw new Error("offline");
      return { ...product, ...patch };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    const stock = await screen.findByRole("spinbutton", { name: /monstera stock/i });
    const price = screen.getByRole("spinbutton", { name: /monstera price/i });
    await user.clear(stock); await user.type(stock, "20");
    await user.clear(price); await user.type(price, "210");
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(await screen.findByRole("alert")).toHaveTextContent(/stock save failed/i);
  });

  it("saves Arabic catalogue fields for an existing product", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);

    await user.click(await screen.findByRole("button", { name: "العربية" }));
    const arabicName = await screen.findByRole("textbox", { name: /monstera arabic name/i });
    await user.type(arabicName, "مونستيرا");
    await user.click(screen.getByRole("button", { name: /save arabic/i }));

    expect(adminApi.updateProduct).toHaveBeenCalledWith("plant-1", {
      nameAr: "مونستيرا",
    });
  });

  it("switches the product-card preview between English and Arabic", async () => {
    vi.mocked(adminApi.products).mockResolvedValue([{
      ...product,
      nameAr: "مونستيرا",
      categoryAr: "داخلي",
      lightAr: "إضاءة ساطعة غير مباشرة",
      descriptionAr: "نبات جميل لمنزلك.",
      image: { url: "/monstera.jpg", altText: "Monstera plant" },
    }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);

    await screen.findByRole("group", { name: /product card preview language/i });
    const englishPreview = document.querySelector(".admin-product-language-preview");
    expect(englishPreview).toHaveAttribute("lang", "en");
    expect(englishPreview).toHaveTextContent("Monstera");
    expect(englishPreview).not.toHaveTextContent("مونستيرا");
    expect(englishPreview).not.toHaveAttribute("dir", "rtl");
    expect(englishPreview).toHaveTextContent("View Monstera");
    expect(englishPreview).toHaveTextContent("Add to cart");
    expect(englishPreview?.querySelector("img")).toHaveAttribute("src", "/monstera.jpg");
    expect(screen.queryByRole("textbox", { name: "Monstera Arabic name" })).not.toBeInTheDocument();
    expect(document.querySelector(".admin-product-ar-fields")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "العربية" }));

    const arabicPreview = document.querySelector(".admin-product-language-preview");
    expect(arabicPreview).toHaveAttribute("lang", "ar");
    expect(arabicPreview).toHaveAttribute("dir", "rtl");
    expect(arabicPreview).toHaveTextContent("مونستيرا");
    expect(arabicPreview).toHaveTextContent("عرض مونستيرا");
    expect(arabicPreview).toHaveTextContent("أضف إلى السلة");
    expect(screen.getByRole("textbox", { name: /monstera arabic name/i })).toHaveValue("مونستيرا");
    expect(screen.getByRole("button", { name: "العربية" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "false");
  });

});
