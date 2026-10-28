import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminProductsPage } from "./AdminProductsPage";
import { adminApi } from "./admin-api";

vi.mock("./admin-api", () => ({
  adminApi: { login: vi.fn(), session: vi.fn(), logout: vi.fn(), products: vi.fn(), updateProduct: vi.fn(), replaceProductImage: vi.fn(), createProduct: vi.fn(), createProductWithImage: vi.fn() },
}));

const product = {
  id: "plant-1", slug: "monstera", name: "Monstera", category: "Indoor",
  description: "A lovely plant for your home.", light: "Bright indirect",
  priceQar: 180, costPrice: 90, stock: 14, inStock: true, image: null,
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

  it("shows name, category, light and description in the English view without switching language", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    expect(await screen.findByRole("heading", { level: 2, name: "Monstera" })).toBeInTheDocument();
    expect(screen.getByText("Bright indirect")).toBeInTheDocument();
    expect(screen.getByText("A lovely plant for your home.")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("hands one selected image to the upload workflow and disables duplicate submission", async () => {
    vi.mocked(adminApi.createProductWithImage).mockImplementation(() => new Promise(() => {}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    await screen.findByText("Monstera");
    expect(screen.queryByLabelText(/plant image/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ New plant" }));
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

  it("saves only the changed English details", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);

    const summary = await screen.findByText("Edit details");
    (summary.parentElement as HTMLDetailsElement).open = true;
    fireEvent(summary.parentElement!, new Event("toggle"));
    const name = screen.getByRole("textbox", { name: /monstera english name/i });
    fireEvent.change(name, { target: { value: "Monstera Deliciosa" } });
    fireEvent.change(screen.getByRole("textbox", { name: /monstera english light/i }), { target: { value: "" } });
    await act(async () => {
      fireEvent.submit(name.closest("form")!);
    });

    expect(adminApi.updateProduct).toHaveBeenCalledWith("plant-1", { name: "Monstera Deliciosa", light: null });
    expect(await screen.findByText("Details saved")).toBeInTheDocument();
  });

  it("replaces a product photo from the card", async () => {
    vi.mocked(adminApi.replaceProductImage).mockResolvedValue({ ...product, image: { url: "/new.png", altText: "Monstera" } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    await screen.findByRole("button", { name: "Change photo for Monstera" });

    const file = new File(["image"], "monstera.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/monstera new photo/i), { target: { files: [file] } });
    });

    expect(adminApi.replaceProductImage).toHaveBeenCalledWith("plant-1", file, "Monstera");
  });

  it("rejects unsupported photo files before uploading", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    await screen.findByRole("button", { name: "Change photo for Monstera" });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/monstera new photo/i), { target: { files: [new File(["x"], "notes.pdf", { type: "application/pdf" })] } });
    });

    expect(adminApi.replaceProductImage).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/choose a png/i);
  });

  it("switches a single card between English and Arabic without affecting other cards", async () => {
    vi.mocked(adminApi.products).mockResolvedValue([
      { ...product, nameAr: "مونستيرا", categoryAr: "داخلي" },
      { ...product, id: "plant-2", slug: "fern", name: "Fern", nameAr: "سرخس" },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);

    const toggle = await screen.findByRole("group", { name: /monstera card language/i });
    fireEvent.click(within(toggle).getByRole("button", { name: "عربي" }));

    expect(screen.getByRole("heading", { level: 2, name: "مونستيرا" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Fern" })).toBeInTheDocument();
    expect(within(toggle).getByRole("button", { name: "عربي" })).toHaveAttribute("aria-pressed", "true");
  });

  it("edits Arabic copy from a card shown in Arabic", async () => {
    vi.mocked(adminApi.products).mockResolvedValue([{ ...product, nameAr: null }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);

    const toggle = await screen.findByRole("group", { name: /monstera card language/i });
    fireEvent.click(within(toggle).getByRole("button", { name: "عربي" }));
    expect(screen.getByText(/no arabic copy yet/i)).toBeInTheDocument();

    const summary = screen.getByText("Edit Arabic details");
    (summary.parentElement as HTMLDetailsElement).open = true;
    fireEvent(summary.parentElement!, new Event("toggle"));
    const name = screen.getByRole("textbox", { name: /monstera arabic name/i });
    fireEvent.change(name, { target: { value: "مونستيرا" } });
    await act(async () => {
      fireEvent.submit(name.closest("form")!);
    });

    expect(adminApi.updateProduct).toHaveBeenCalledWith("plant-1", { nameAr: "مونستيرا" });
  });

  it("toggles publishing from the status badge", async () => {
    vi.mocked(adminApi.updateProduct).mockImplementation(async (_id, patch) => ({ ...product, ...patch }));
    vi.mocked(adminApi.products).mockResolvedValue([{ ...product, published: true }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);

    const badge = await screen.findByRole("button", { name: "Published" });
    expect(badge).toHaveAttribute("aria-pressed", "true");
    await act(async () => { fireEvent.click(badge); });

    expect(adminApi.updateProduct).toHaveBeenCalledWith("plant-1", { published: false });
    const unpublished = await screen.findByRole("button", { name: "Unpublished" });
    expect(unpublished).toHaveAttribute("aria-pressed", "false");
    expect(unpublished.closest("li")).toHaveClass("is-draft");

    await act(async () => { fireEvent.click(unpublished); });
    expect(adminApi.updateProduct).toHaveBeenLastCalledWith("plant-1", { published: true });
    expect(await screen.findByRole("button", { name: "Published" })).toBeInTheDocument();
  });

  it("opens the photo picker from the photo itself", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    const photo = await screen.findByRole("button", { name: "Change photo for Monstera" });
    const input = screen.getByLabelText(/monstera new photo/i) as HTMLInputElement;
    const click = vi.spyOn(input, "click");

    fireEvent.click(photo);

    expect(click).toHaveBeenCalled();
    expect(photo.querySelector("img")).not.toBeNull();
  });
});

