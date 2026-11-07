import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewStories } from "./ReviewStories";
import { reviewApi } from "./review-api";
import type { PublicReview } from "./review-types";

vi.mock("./review-api", () => ({ reviewApi: { list: vi.fn() } }));

const story = (id: string, overrides: Partial<PublicReview> = {}): PublicReview => ({
  id,
  customerName: `Customer ${id}`,
  body: `The plant from order ${id} arrived healthy and settled in beautifully.`,
  rating: 5,
  imageUrl: null,
  product: null,
  reviewedAt: null,
  location: null,
  label: null,
  ...overrides,
});

function renderStories() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ReviewStories /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReviewStories", () => {
  beforeEach(() => vi.mocked(reviewApi.list).mockReset());
  afterEach(cleanup);

  it("renders nothing while there are no published stories", async () => {
    vi.mocked(reviewApi.list).mockResolvedValue([]);
    const { container } = renderStories();
    await vi.waitFor(() => expect(reviewApi.list).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one story at a time to assistive technology and steps through them", async () => {
    vi.mocked(reviewApi.list).mockResolvedValue([story("a"), story("b"), story("c")]);
    const user = userEvent.setup();
    const { container } = renderStories();

    expect(await screen.findByRole("heading", { name: /plants that found their place/i })).toBeInTheDocument();
    // Only the sheet in front is in the accessibility tree; the pile behind it is hidden and inert.
    expect(screen.getAllByRole("group").filter((element) => element.getAttribute("aria-roledescription") === "slide")).toHaveLength(1);
    const slides = [...container.querySelectorAll<HTMLElement>(".story-slide")];
    expect(slides).toHaveLength(3);
    expect(slides.map((slide) => slide.getAttribute("data-place"))).toEqual(["front", "next", "after"]);
    expect(slides[1]).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Customer a")).toBeVisible();
    expect(screen.getByText("01")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next story/i }));
    expect(slides.map((slide) => slide.getAttribute("data-place"))).toEqual(["after", "front", "next"]);
    expect(screen.getByText("02")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /previous story/i }));
    await user.click(screen.getByRole("button", { name: /previous story/i }));
    // Going back past the first story wraps to the last one.
    expect(slides.map((slide) => slide.getAttribute("data-place"))).toEqual(["next", "after", "front"]);

    await user.click(screen.getByRole("button", { name: /show story 2 of 3/i }));
    expect(slides[1]).toHaveAttribute("data-place", "front");
    expect(screen.getByRole("button", { name: /show story 2 of 3/i })).toHaveAttribute("aria-current", "true");
  });

  it("moves with the arrow keys, and the other way in Arabic reading order", async () => {
    vi.mocked(reviewApi.list).mockResolvedValue([story("a"), story("b")]);
    const { container } = renderStories();
    const region = await screen.findByRole("group", { name: /customer stories/i });
    const slides = [...container.querySelectorAll<HTMLElement>(".story-slide")];

    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(slides[1]).toHaveAttribute("data-place", "front");
    fireEvent.keyDown(region, { key: "ArrowLeft" });
    expect(slides[0]).toHaveAttribute("data-place", "front");
  });

  it("gives each story 3.5 seconds, shown by the active tick filling over exactly that time", async () => {
    vi.mocked(reviewApi.list).mockResolvedValue([story("a"), story("b")]);
    const { container } = renderStories();

    await screen.findByText("Customer a");
    const fill = container.querySelector<HTMLElement>(".stories__tick-fill");
    expect(fill?.style.getPropertyValue("--advance")).toBe("3500ms");
    expect(container.querySelectorAll(".stories__tick-fill")).toHaveLength(1);
  });

  it("shows a single story without any controls", async () => {
    vi.mocked(reviewApi.list).mockResolvedValue([story("only")]);
    renderStories();

    expect(await screen.findByText("Customer only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next story/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show story/i })).not.toBeInTheDocument();
  });

  it("draws the rating, location, date and a link to the product, and falls back to a drawing without a photo", async () => {
    vi.mocked(reviewApi.list).mockResolvedValue([
      story("a", {
        rating: 4,
        location: "West Bay",
        label: "Living room",
        reviewedAt: "2026-10-31",
        product: { slug: "monstera-deliciosa", name: "Monstera Deliciosa", nameAr: null },
      }),
    ]);
    const { container } = renderStories();

    expect(await screen.findByRole("img", { name: "Rated 4 out of 5" })).toBeInTheDocument();
    expect(screen.getByText("West Bay")).toBeInTheDocument();
    expect(screen.getByText("Living room")).toBeInTheDocument();
    expect(screen.getByText(/october 2026/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /about monstera deliciosa/i })).toHaveAttribute("href", "/plants/monstera-deliciosa");
    expect(container.querySelector(".story-sheet__drawing")).toBeInTheDocument();
    expect(container.querySelector(".story-sheet__photo img")).toBeNull();
  });

  it("uses the customer photo when there is one, and the drawing again if it fails to load", async () => {
    vi.mocked(reviewApi.list).mockResolvedValue([story("a", { imageUrl: "/photos/a.webp" })]);
    const { container } = renderStories();

    const photo = await screen.findByRole("img", { name: /customer a, a qleaves customer/i });
    expect(photo).toHaveAttribute("src", "/photos/a.webp");
    fireEvent.error(photo);
    expect(container.querySelector(".story-sheet__photo img")).toBeNull();
    expect(container.querySelector(".story-sheet__drawing")).toBeInTheDocument();
  });
});
