import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminReviewsPage } from "./AdminReviewsPage";
import { adminApi, type AdminReview } from "./admin-api";
import { ApiClientError } from "../../lib/api-error";

vi.mock("./admin-api", () => ({
  adminApi: {
    reviews: vi.fn(),
    products: vi.fn(),
    createReview: vi.fn(),
    updateReview: vi.fn(),
    deleteReview: vi.fn(),
    moveReview: vi.fn(),
  },
}));

const review = (id: string, overrides: Partial<AdminReview> = {}): AdminReview => ({
  id,
  customerName: `Customer ${id}`,
  body: `Review text for customer ${id}, long enough to be valid.`,
  rating: 5,
  imageUrl: null,
  productId: null,
  productName: null,
  reviewedAt: null,
  location: null,
  label: null,
  sortOrder: 0,
  published: true,
  createdAt: "2026-11-01T10:00:00.000Z",
  ...overrides,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AdminReviewsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminReviewsPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(adminApi.products).mockResolvedValue([
      { id: "p1", slug: "monstera", name: "Monstera", description: "A lovely plant.", category: "Indoor", light: null, priceQar: 100, stock: 3, published: true },
      { id: "p2", slug: "draft-plant", name: "Draft Plant", description: "A lovely plant.", category: "Indoor", light: null, priceQar: 0, stock: 0, published: false },
    ]);
  });
  afterEach(cleanup);

  it("shows an empty state, then the stories in the shop's order", async () => {
    vi.mocked(adminApi.reviews).mockResolvedValueOnce([]);
    const first = renderPage();
    expect(await screen.findByText(/no stories yet/i)).toBeInTheDocument();
    first.unmount();

    vi.mocked(adminApi.reviews).mockResolvedValue([review("a", { productName: "Monstera", location: "West Bay" }), review("b", { published: false })]);
    renderPage();
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Customer a")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/west bay · monstera/i)).toBeInTheDocument();
    expect(within(rows[1]).getByRole("button", { name: "Draft" })).toHaveAttribute("aria-pressed", "false");
    expect(within(rows[0]).getByRole("button", { name: /move up: customer a/i })).toBeDisabled();
    expect(within(rows[1]).getByRole("button", { name: /move down: customer b/i })).toBeDisabled();
  });

  it("publishes, unpublishes and reorders", async () => {
    vi.mocked(adminApi.reviews).mockResolvedValue([review("a"), review("b", { published: false })]);
    vi.mocked(adminApi.updateReview).mockResolvedValue(review("a"));
    vi.mocked(adminApi.moveReview).mockResolvedValue([review("b"), review("a")]);
    const user = userEvent.setup();
    renderPage();
    const rows = await screen.findAllByRole("listitem");

    await user.click(within(rows[0]).getByRole("button", { name: "Published" }));
    expect(adminApi.updateReview).toHaveBeenCalledWith("a", { published: false });
    await user.click(within(rows[1]).getByRole("button", { name: "Draft" }));
    expect(adminApi.updateReview).toHaveBeenCalledWith("b", { published: true });
    await user.click(within(rows[1]).getByRole("button", { name: /move up: customer b/i }));
    expect(adminApi.moveReview).toHaveBeenCalledWith("b", "up");
  });

  it("asks twice before deleting", async () => {
    vi.mocked(adminApi.reviews).mockResolvedValue([review("a")]);
    vi.mocked(adminApi.deleteReview).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findAllByRole("listitem"))[0];

    await user.click(within(row).getByRole("button", { name: "Delete" }));
    expect(adminApi.deleteReview).not.toHaveBeenCalled();
    await user.click(within(row).getByRole("button", { name: "Keep" }));
    expect(within(row).getByRole("button", { name: "Delete" })).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "Delete" }));
    await user.click(within(row).getByRole("button", { name: "Confirm delete" }));
    expect(adminApi.deleteReview).toHaveBeenCalledWith("a");
  });

  it("previews a new story as it is typed and saves it as a draft by default", async () => {
    vi.mocked(adminApi.reviews).mockResolvedValue([]);
    vi.mocked(adminApi.createReview).mockResolvedValue(review("new", { published: false }));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /new story/i }));
    const form = screen.getByRole("form", { name: /add a story/i });
    await user.type(within(form).getByLabelText("Customer name"), "Mariam");
    await user.type(within(form).getByLabelText(/review text/i), "Arrived healthy and wrapped with care.");
    await user.type(within(form).getByLabelText(/location/i), "The Pearl");
    await user.click(within(form).getByRole("radio", { name: "4 of 5" }));

    const preview = screen.getByRole("region", { name: /preview before publishing/i });
    expect(within(preview).getByText("Mariam")).toBeInTheDocument();
    expect(within(preview).getByText("Arrived healthy and wrapped with care.")).toBeInTheDocument();
    expect(within(preview).getByText("The Pearl")).toBeInTheDocument();
    expect(within(preview).getByRole("img", { name: "Rated 4 out of 5" })).toBeInTheDocument();

    await user.click(within(form).getByRole("button", { name: "Save" }));
    expect(adminApi.createReview).toHaveBeenCalledWith({
      customerName: "Mariam",
      body: "Arrived healthy and wrapped with care.",
      rating: 4,
      productId: null,
      reviewedAt: null,
      location: "The Pearl",
      label: null,
      published: false,
    });
    expect(screen.queryByRole("form", { name: /add a story/i })).not.toBeInTheDocument();
  });

  it("edits an existing story, links a product and can remove its photo", async () => {
    vi.mocked(adminApi.reviews).mockResolvedValue([review("a", { imageUrl: "data:image/png;base64,AAAA" })]);
    vi.mocked(adminApi.updateReview).mockResolvedValue(review("a"));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit story" }));
    const form = screen.getByRole("form", { name: /edit story/i });
    await user.selectOptions(within(form).getByLabelText(/product/i), "p1");
    await user.click(within(form).getByRole("button", { name: /remove photo/i }));
    await user.click(within(form).getByRole("button", { name: "Save" }));

    expect(adminApi.updateReview).toHaveBeenCalledWith("a", expect.objectContaining({ productId: "p1", removeImage: true, published: true }));
  });

  it("shows the server's message when saving fails and keeps the form open", async () => {
    vi.mocked(adminApi.reviews).mockResolvedValue([]);
    vi.mocked(adminApi.createReview).mockRejectedValue(new ApiClientError("The review needs at least 10 characters", "VALIDATION_ERROR", undefined, 400));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /new story/i }));
    const form = screen.getByRole("form", { name: /add a story/i });
    await user.type(within(form).getByLabelText("Customer name"), "Mariam");
    await user.type(within(form).getByLabelText(/review text/i), "Long enough text here.");
    await user.click(within(form).getByRole("button", { name: "Save" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(/at least 10 characters/i);
    expect(screen.getByRole("form", { name: /add a story/i })).toBeInTheDocument();
  });
});
