import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ProductCard } from "./ProductCard";
import { ProductPrice } from "./product-presentation";
import type { ProductSummary } from "./product-types";

// 0 QAR means the price is not set yet (owner's decision, 2026-11-18): shown as "Price coming soon", never for sale.
const plant = (priceQar: number, compareAtPriceQar: number | null = null): ProductSummary => ({
  id: "p1", slug: "plant", name: "Plant", category: "Indoor Plants", light: null, priceQar, compareAtPriceQar, stock: 4, inStock: true, image: null, media: [],
} as ProductSummary);
const card = (product: ProductSummary) => render(
  <QueryClientProvider client={new QueryClient()}><MemoryRouter><ul><ProductCard product={product} orderingEnabled /></ul></MemoryRouter></QueryClientProvider>,
);

describe("plants without a price", () => {
  afterEach(cleanup);

  it("say Price coming soon in English and Arabic, never 0 QAR or an offer", () => {
    const { container, rerender } = render(<ProductPrice priceQar={0} compareAtPriceQar={120} isArabic={false} />);
    expect(container).toHaveTextContent(/^Price coming soon$/);
    rerender(<ProductPrice priceQar={0} isArabic />);
    expect(container).toHaveTextContent(/^السعر قريبًا$/);
  });

  it("have no Add to cart button on their card; priced plants do", () => {
    card(plant(0, 120));
    expect(screen.getByText("Price coming soon")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add .* to cart/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Offer")).not.toBeInTheDocument();
    cleanup();
    card(plant(45));
    expect(screen.getByRole("button", { name: /add .* to cart/i })).toBeInTheDocument();
  });
});
