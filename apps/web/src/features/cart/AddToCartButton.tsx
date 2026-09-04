import { useState } from "react";
import { content } from "../../content/en";
import type { ProductSummary } from "../catalog/product-types";
import { useCartStore } from "./cart-store";

export function AddToCartButton({
  product,
  className = "add-to-cart",
}: {
  product: ProductSummary;
  className?: string;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const quantity = useCartStore((state) => state.items.find((item) => item.id === product.id)?.quantity ?? 0);
  const [announcement, setAnnouncement] = useState("");

  function addToCart() {
    if (quantity >= product.stock) {
      setAnnouncement(`${product.name} is already at the available stock limit`);
      return;
    }
    addItem(product);
    setAnnouncement(`${product.name} added to cart`);
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={`Add ${product.name} to cart`}
        disabled={!product.inStock}
        onClick={addToCart}
      >
        {content.product.addToCart}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
