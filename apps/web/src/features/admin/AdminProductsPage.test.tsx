import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminProductsPage } from "./AdminProductsPage";
import { createHash } from "node:crypto";
import { adminApi, type AdminPhoto } from "./admin-api";
import { installPagedFakes } from "./test-pages";

vi.mock("./admin-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin-api")>()),
  adminApi: {
    login: vi.fn(), session: vi.fn(), logout: vi.fn(), products: vi.fn(), updateProduct: vi.fn(), replaceProductImage: vi.fn(), createProduct: vi.fn(), createProductWithImage: vi.fn(),
    addPhoto: vi.fn(), replacePhoto: vi.fn(), removePhoto: vi.fn(), reorderPhotos: vi.fn(), describePhoto: vi.fn(),
    productsPage: vi.fn(), ordersPage: vi.fn(), invoicesPage: vi.fn(), order: vi.fn(), clearOrderTab: vi.fn(),
  },
}));

const photo = (key: string, extra: Partial<AdminPhoto> = {}): AdminPhoto => ({ key, url: `/${key}.webp`, detailUrl: `/${key}-detail.webp`, altText: `Monstera ${key}`, width: 640, height: 640, contentHash: null, ...extra });

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
    installPagedFakes(adminApi);
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
    expect(screen.queryByLabelText(/plant photos/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ New plant" }));
    const imageInput = screen.getByLabelText(/plant photos/i);
    const file = new File(["image"], "fern.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(imageInput, { target: { files: [file] } });
    });
    expect(await screen.findByAltText("Selected photo 1")).toBeInTheDocument();

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

  const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminProductsPage /></QueryClientProvider>);
  const withPhotos = (...keys: string[]) => vi.mocked(adminApi.products).mockResolvedValue([{ ...product, photos: keys.map((key) => photo(key)) }]);

  it("adds a photo from an empty slot", async () => {
    withPhotos("a");
    vi.mocked(adminApi.addPhoto).mockResolvedValue({ ...product, photos: [photo("a"), photo("b")] });
    renderPage();
    const [add] = await screen.findAllByRole("button", { name: "Add photo (Monstera)" });
    const input = screen.getByLabelText("Monstera: Add photo") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    fireEvent.click(add);
    expect(click).toHaveBeenCalled();
    expect(screen.getByText("1 of 3 photos")).toBeInTheDocument();

    const file = new File(["image"], "monstera.png", { type: "image/png" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });

    await waitFor(() => expect(adminApi.addPhoto).toHaveBeenCalledWith("plant-1", file, "Monstera", expect.any(Function)));
    expect(await screen.findByRole("button", { name: "Photo 2 of 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 of 3 photos")).toBeInTheDocument();
  });

  it("rejects unsupported photo files before uploading", async () => {
    withPhotos("a");
    renderPage();
    await screen.findAllByRole("button", { name: "Add photo (Monstera)" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Monstera: Add photo"), { target: { files: [new File(["x"], "notes.pdf", { type: "application/pdf" })] } });
    });
    expect(adminApi.addPhoto).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/choose a png/i);
  });

  it("refuses a photo that is already on the product before uploading it", async () => {
    const hash = createHash("sha256").update("image").digest("hex");
    vi.mocked(adminApi.products).mockResolvedValue([{ ...product, photos: [photo("a", { contentHash: hash })] }]);
    renderPage();
    await screen.findAllByRole("button", { name: "Add photo (Monstera)" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Monstera: Add photo"), { target: { files: [new File(["image"], "again.png", { type: "image/png" })] } });
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This photo is already on this product."));
    expect(adminApi.addPhoto).not.toHaveBeenCalled();
  });

  it("makes a photo the main one and moves photos with buttons", async () => {
    withPhotos("a", "b", "c");
    vi.mocked(adminApi.reorderPhotos).mockImplementation(async (_id, keys) => ({ ...product, photos: keys.map((key) => photo(key)) }));
    renderPage();
    expect(await screen.findByRole("button", { name: "Make main" })).toBeDisabled();
    expect(screen.queryByText(/of 3 photos/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Photo 3 of 3" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Make main" })); });
    expect(adminApi.reorderPhotos).toHaveBeenCalledWith("plant-1", ["c", "a", "b"]);
    // The moved photo stays selected, now in first place.
    expect(await screen.findByRole("button", { name: "Photo 1 of 3 (Main)" })).toHaveAttribute("aria-pressed", "true");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Move later" })); });
    expect(adminApi.reorderPhotos).toHaveBeenLastCalledWith("plant-1", ["a", "c", "b"]);
  });

  it("reorders photos by dragging one onto another", async () => {
    withPhotos("a", "b", "c");
    vi.mocked(adminApi.reorderPhotos).mockImplementation(async (_id, keys) => ({ ...product, photos: keys.map((key) => photo(key)) }));
    renderPage();
    const first = (await screen.findByRole("button", { name: "Photo 1 of 3 (Main)" })).closest("li")!;
    const last = screen.getByRole("button", { name: "Photo 3 of 3" }).closest("li")!;
    expect(first).toHaveAttribute("draggable", "true");
    await act(async () => { fireEvent.dragStart(first); });
    await act(async () => {
      fireEvent.dragOver(last);
      fireEvent.drop(last);
    });
    expect(adminApi.reorderPhotos).toHaveBeenCalledWith("plant-1", ["b", "c", "a"]);
  });

  it("removes a photo only after confirmation and never the last one", async () => {
    withPhotos("a", "b");
    vi.mocked(adminApi.removePhoto).mockResolvedValue({ ...product, photos: [photo("a")] });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Photo 2 of 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(adminApi.removePhoto).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Yes, remove" })); });
    expect(adminApi.removePhoto).toHaveBeenCalledWith("plant-1", "b");
    expect(await screen.findByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("replaces the selected photo and saves its description", async () => {
    withPhotos("a", "b");
    vi.mocked(adminApi.replacePhoto).mockResolvedValue({ ...product, photos: [photo("a"), photo("b")] });
    vi.mocked(adminApi.describePhoto).mockResolvedValue({ ...product, photos: [photo("a"), photo("b", { altText: "Monstera leaf close-up" })] });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Photo 2 of 2" }));
    const file = new File(["new"], "new.png", { type: "image/png" });
    await act(async () => { fireEvent.change(screen.getByLabelText("Monstera: Replace"), { target: { files: [file] } }); });
    await waitFor(() => expect(adminApi.replacePhoto).toHaveBeenCalledWith("plant-1", "b", file, "Monstera b", expect.any(Function)));

    const description = await screen.findByLabelText("Photo description");
    fireEvent.change(description, { target: { value: "Monstera leaf close-up" } });
    await act(async () => { fireEvent.submit(description.closest("form")!); });
    expect(adminApi.describePhoto).toHaveBeenCalledWith("plant-1", "b", "Monstera leaf close-up");
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

  it("edits humidity, soil and temperature in English and in Arabic", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    const summary = await screen.findByText("Edit details");
    (summary.parentElement as HTMLDetailsElement).open = true;
    fireEvent(summary.parentElement!, new Event("toggle"));
    expect(screen.getByText(/empty items are not shown to customers/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /monstera english humidity/i }), { target: { value: "Average room humidity" } });
    fireEvent.change(screen.getByRole("textbox", { name: /monstera english temperature/i }), { target: { value: "18 to 30 °C" } });
    await act(async () => { fireEvent.submit(screen.getByRole("textbox", { name: /monstera english soil/i }).closest("form")!); });
    expect(adminApi.updateProduct).toHaveBeenCalledWith("plant-1", { humidity: "Average room humidity", temperature: "18 to 30 °C" });

    const toggle = screen.getByRole("group", { name: /monstera card language/i });
    fireEvent.click(within(toggle).getByRole("button", { name: "عربي" }));
    const arabicSummary = screen.getByText("Edit Arabic details");
    (arabicSummary.parentElement as HTMLDetailsElement).open = true;
    fireEvent(arabicSummary.parentElement!, new Event("toggle"));
    const soil = await screen.findByRole("textbox", { name: /monstera arabic soil/i });
    fireEvent.change(soil, { target: { value: "خلطة جيدة التصريف" } });
    await act(async () => { fireEvent.submit(soil.closest("form")!); });
    expect(adminApi.updateProduct).toHaveBeenLastCalledWith("plant-1", { soilAr: "خلطة جيدة التصريف" });
  });

  it("edits height, pot and size notes, and refuses an impossible height", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    const summary = await screen.findByText("Edit details");
    (summary.parentElement as HTMLDetailsElement).open = true;
    fireEvent(summary.parentElement!, new Event("toggle"));
    const height = screen.getByRole("spinbutton", { name: /monstera height/i });
    fireEvent.change(height, { target: { value: "0" } });
    await act(async () => { fireEvent.submit(height.closest("form")!); });
    expect(screen.getByText(/height must be a whole number/i)).toBeInTheDocument();
    expect(adminApi.updateProduct).not.toHaveBeenCalled();

    fireEvent.change(height, { target: { value: "150" } });
    fireEvent.change(screen.getByRole("combobox", { name: /monstera pot included/i }), { target: { value: "no" } });
    fireEvent.change(screen.getByRole("textbox", { name: /monstera english size note/i }), { target: { value: "Tall floor plant" } });
    await act(async () => { fireEvent.submit(height.closest("form")!); });
    expect(adminApi.updateProduct).toHaveBeenCalledWith("plant-1", { sizeNote: "Tall floor plant", heightCm: 150, potIncluded: false });
  });

  it("warns about a product priced 0 QAR, which can still be published (customers see Price coming soon)", async () => {
    vi.mocked(adminApi.products).mockResolvedValue([{ ...product, priceQar: 0, published: false }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);
    expect(await screen.findByText(/price not set: customers see "price coming soon" and cannot order it/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpublished" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "+ New plant" }));
    expect(screen.getByText(/at 0 qar the plant is saved unpublished/i)).toBeInTheDocument();
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
    // The list answers with what was last saved, as the server would.
    let saved: Awaited<ReturnType<typeof adminApi.updateProduct>> = { ...product, published: true } as never;
    vi.mocked(adminApi.updateProduct).mockImplementation(async (_id, patch) => (saved = { ...saved, ...patch }));
    vi.mocked(adminApi.products).mockImplementation(async () => [saved]);
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

  it("creates a product with its first photo and then adds the others in order", async () => {
    vi.mocked(adminApi.createProductWithImage).mockResolvedValue({ ...product, id: "plant-9", name: "Fern", photos: [photo("a")] });
    vi.mocked(adminApi.addPhoto).mockResolvedValue({ ...product, id: "plant-9", name: "Fern", photos: [photo("a"), photo("b")] });
    renderPage();
    await screen.findByText("Monstera");
    fireEvent.click(screen.getByRole("button", { name: "+ New plant" }));
    const files = [new File(["one"], "one.png", { type: "image/png" }), new File(["two"], "two.png", { type: "image/png" })];
    await act(async () => { fireEvent.change(screen.getByLabelText(/plant photos/i), { target: { files } }); });
    expect(await screen.findByAltText("Selected photo 2")).toBeInTheDocument();
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Add plant" }).closest("form")!); });

    expect(vi.mocked(adminApi.createProductWithImage).mock.calls[0]?.[1]).toBe(files[0]);
    await waitFor(() => expect(adminApi.addPhoto).toHaveBeenCalledWith("plant-9", files[1], "", expect.any(Function)));
  });

  it("refuses more than three photos or the same photo twice in the new-plant form", async () => {
    renderPage();
    await screen.findByText("Monstera");
    fireEvent.click(screen.getByRole("button", { name: "+ New plant" }));
    const input = screen.getByLabelText(/plant photos/i);
    const four = ["1", "2", "3", "4"].map((n) => new File([n], `${n}.png`, { type: "image/png" }));
    await act(async () => { fireEvent.change(input, { target: { files: four } }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose at most 3 photos.");
    const twice = [new File(["same"], "a.png", { type: "image/png" }), new File(["same"], "b.png", { type: "image/png" })];
    await act(async () => { fireEvent.change(input, { target: { files: twice } }); });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The same photo was chosen twice."));
  });

  it("edits the featured flag, original price, care details and review flag, and filters by them", async () => {
    const draft = { ...product, id: "plant-2", slug: "calathea", name: "Calathea Ornata", published: false, needsReview: true, reviewNote: "Confirm the variety" };
    vi.mocked(adminApi.products).mockResolvedValue([product, draft]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<QueryClientProvider client={client}><AdminProductsPage /></QueryClientProvider>);

    expect(await screen.findByText(/needs review: confirm the variety/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /needs review 1/i }));
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toContain("Calathea Ornata");
    expect(screen.queryByRole("heading", { name: "Monstera" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^all 2/i }));

    const card = screen.getByRole("heading", { name: "Monstera" }).closest("li")!;
    await user.click(within(card).getByText("Edit details"));
    await user.click(within(card).getByLabelText(/featured on the home page/i));
    await user.type(within(card).getByLabelText(/monstera original price/i), "220");
    await user.selectOptions(within(card).getByLabelText(/monstera care level/i), "easy");
    await user.type(within(card).getByLabelText(/monstera botanical name/i), "Monstera deliciosa");
    await user.click(within(card).getByRole("button", { name: /save details/i }));

    expect(adminApi.updateProduct).toHaveBeenCalledWith("plant-1", {
      featured: true, compareAtPriceQar: 220, careLevel: "easy", scientificName: "Monstera deliciosa",
    });
  });
});
