import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductGallery, ProductPrice, photosOf } from "./product-presentation";

describe("product presentation", () => {
  afterEach(cleanup);

  it("shows an earlier price and the saving only for a genuine reduction", () => {
    const { container, rerender } = render(<ProductPrice priceQar={80} compareAtPriceQar={100} isArabic={false} />);
    expect(container).toHaveTextContent("80 QAR100 QAR-20%");
    expect(screen.getByLabelText("Was 100 QAR")).toBeInTheDocument();

    rerender(<ProductPrice priceQar={80} compareAtPriceQar={80} isArabic={false} />);
    expect(container).toHaveTextContent(/^80 QAR$/);
    rerender(<ProductPrice priceQar={80} compareAtPriceQar={null} isArabic />);
    expect(container).toHaveTextContent(/^80 QAR$/);
  });

  it("groups catalogue and detail images back into photos and switches between them", () => {
    const media = [
      { url: "/a-640.webp", altText: "A", purpose: "catalog" as const, width: 640, height: 640 },
      { url: "/a-1024.webp", altText: "A", purpose: "detail" as const, width: 1024, height: 1024 },
      { url: "/a-2-640.webp", altText: "A", purpose: "catalog" as const, width: 640, height: 640 },
      { url: "/a-2-1024.webp", altText: "A", purpose: "detail" as const, width: 1024, height: 1024 },
    ];
    expect(photosOf(media).map((photo) => photo.map((item) => item.url))).toEqual([["/a-640.webp", "/a-1024.webp"], ["/a-2-640.webp", "/a-2-1024.webp"]]);

    render(<ProductGallery media={media} alt="Aloe" isArabic={false} />);
    expect(screen.getByRole("button", { name: "Photo 1 of 2" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Photo 2 of 2" }));
    expect(screen.getByTestId("product-image")).toHaveAttribute("src", "/a-2-1024.webp");
  });

  it("shows no thumbnails for a single photo", () => {
    render(<ProductGallery media={[{ url: "/b-640.webp", altText: "B", purpose: "catalog" }]} alt="B" isArabic={false} />);
    expect(screen.queryByRole("group", { name: "Product photos" })).not.toBeInTheDocument();
  });
});
