import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminProductsPage } from "./AdminProductsPage";
import { adminApi } from "./admin-api";

vi.mock("./admin-api", () => ({
  adminApi: { login: vi.fn(), session: vi.fn(), logout: vi.fn(), products: vi.fn(), updateProduct: vi.fn(), createProduct: vi.fn(), createProductWithImage: vi.fn() },
}));

const product = {
  id: "plant-1", slug: "monstera", name: "Monstera", category: "Indoor",
  light: "Bright indirect", priceQar: 180, stock: 14, inStock: true, image: null,
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

  it("persists Arabic catalogue copy when an editor leaves the field", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);

    const arabicName = await screen.findByRole("textbox", { name: /monstera arabic name/i });
    await user.clear(arabicName);
    await user.type(arabicName, "مونستيرا");
    await user.tab();

    expect(adminApi.updateProduct).toHaveBeenCalledWith("plant-1", { nameAr: "مونستيرا" });
  });

  it("hands one selected image to the upload workflow and disables duplicate submission", async () => {
    vi.mocked(adminApi.createProductWithImage).mockImplementation(() => new Promise(() => {}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    await screen.findByText("Monstera");
    const imageInput = screen.getByLabelText(/plant image/i);
    const file = new File(["image"], "fern.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(imageInput, { target: { files: [file] } });
    });

    const submit = screen.getByRole("button", { name: "Add plant" });
    await act(async () => {
      fireEvent.submit(submit.closest("form")!);
    });

    expect(adminApi.createProductWithImage).toHaveBeenCalledOnce();
    expect(vi.mocked(adminApi.createProductWithImage).mock.calls[0]?.[1]).toBe(file);
    expect(await screen.findByRole("button", { name: "Adding…" })).toBeDisabled();
  });
});
