import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProductImage } from "./ProductImage";
import type { ProductMedia } from "../features/catalog/product-types";

const responsiveMedia = [
  { url: "/catalog.webp", altText: "Monstera", width: 640, height: 480, purpose: "catalog" },
  { url: "/detail.webp", altText: "Monstera", width: 1400, height: 1050, purpose: "detail" },
] satisfies ProductMedia[];

describe("ProductImage", () => {
  afterEach(cleanup);

  it("renders explicit dimensions and responsive sources", () => {
    const { container } = render(
      <ProductImage
        media={responsiveMedia}
        alt="Monstera"
        preferredPurpose="detail"
        sizes="(max-width: 640px) 100vw, 320px"
      />,
    );

    expect(screen.getByRole("img")).toHaveAttribute("src", "/detail.webp");
    expect(screen.getByRole("img")).toHaveAttribute("width", "1400");
    expect(screen.getByRole("img")).toHaveAttribute("height", "1050");
    expect(container.querySelector("source")).toHaveAttribute(
      "srcset",
      "/catalog.webp 640w, /detail.webp 1400w",
    );
  });

  it("keeps legacy media working without invented dimensions", () => {
    const { container } = render(
      <ProductImage media={[{ url: "/legacy.jpg", altText: "Legacy plant" }]} alt="Legacy plant" />,
    );

    expect(container.querySelector("picture")).not.toBeInTheDocument();
    expect(screen.getByRole("img")).not.toHaveAttribute("width");
  });

  it("preserves the local fallback behavior", () => {
    render(<ProductImage media={responsiveMedia} alt="Monstera" />);
    const image = screen.getByRole("img");
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", "/images/hero/leaf-1.svg");
  });
});
