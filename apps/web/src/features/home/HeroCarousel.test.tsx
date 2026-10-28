import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroCarousel } from "./HeroCarousel";
import { HERO_POOL } from "./HeroGallery";

const carouselProps = vi.fn();
vi.mock("../../components/flex-carousel/FlexCarousel", () => ({
  default: (props: Record<string, unknown>) => {
    carouselProps(props);
    return <div data-testid="flex-carousel" />;
  },
}));

function mockWebGl2(available: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((type: string) => (type === "webgl2" && available ? {} : null)) as never);
}

describe("HeroCarousel", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); carouselProps.mockClear(); });

  it("falls back to the photo gallery when WebGL2 is unavailable", () => {
    mockWebGl2(false);
    render(<HeroCarousel isArabic={false} />);

    expect(screen.queryByTestId("hero-carousel")).not.toBeInTheDocument();
    expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
  });

  it("loops every catalogue photo in a shuffled order, with autoplay and page scrolling left alone", async () => {
    mockWebGl2(true);
    render(<HeroCarousel isArabic={false} />);

    expect(await screen.findByTestId("flex-carousel")).toBeInTheDocument();
    const props = carouselProps.mock.calls.at(-1)![0] as { items: Array<{ src: string }>; autoplay: boolean; captureWheel: boolean };
    expect(props.items.map((item) => item.src).sort()).toEqual(HERO_POOL.map((image) => image.src).sort());
    expect(props.autoplay).toBe(true);
    expect(props.captureWheel).toBe(false);
  });

  it("adds blurred edges on both sides that never block dragging", () => {
    mockWebGl2(true);
    render(<HeroCarousel isArabic={false} />);
    const edges = screen.getByTestId("hero-carousel").querySelectorAll(".hero-carousel__blur");

    expect(edges).toHaveLength(2);
    for (const edge of edges) expect(edge).toHaveAttribute("aria-hidden", "true");
  });
});
