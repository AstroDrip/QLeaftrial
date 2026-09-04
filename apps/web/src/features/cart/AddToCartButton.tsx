import { useEffect, useRef, useState } from "react";
import type { ProductSummary } from "../catalog/product-types";
import { useCartStore } from "./cart-store";
import "./AddToCartButton.css";

const CONFIRMATION_MS = 1300;

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return reducedMotion;
}

function CartIcon() {
  return (
    <svg
      className="add-to-cart__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 8h10l1 11H6L7 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </svg>
  );
}

export function AddToCartButton({
  product,
  className,
}: {
  product: ProductSummary;
  className?: string;
}) {
  const addItem = useCartStore((state) => state.addItem);
  const quantity = useCartStore(
    (state) => state.items.find((item) => item.id === product.id)?.quantity ?? 0,
  );
  const [announcement, setAnnouncement] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const outOfStock = !product.inStock || product.stock <= 0;
  const maxInCart = !outOfStock && quantity >= product.stock;
  const disabled = outOfStock || maxInCart;

  useEffect(
    () => () => {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    },
    [],
  );

  function addToCart() {
    if (disabled) return;

    const added = addItem(product);
    if (!added) {
      setAnnouncement(`${product.name} could not be added because the available stock is already in your cart`);
      return;
    }

    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    setIsConfirming(true);
    setAnnouncement(`${product.name} added to cart`);
    confirmationTimer.current = setTimeout(() => {
      confirmationTimer.current = null;
      setIsConfirming(false);
    }, CONFIRMATION_MS);
  }

  const label = isConfirming
    ? "Added ✓"
    : outOfStock
      ? "Out of stock"
      : maxInCart
        ? "Max in cart"
        : "Add to cart";

  const accessibleName = outOfStock
    ? `${product.name} is out of stock`
    : maxInCart
      ? `Maximum stock of ${product.name} is already in cart`
      : `Add ${product.name} to cart`;

  return (
    <>
      <button
        type="button"
        className={["add-to-cart", className].filter(Boolean).join(" ")}
        aria-label={accessibleName}
        disabled={disabled}
        data-state={isConfirming ? "added" : outOfStock ? "out" : maxInCart ? "max" : quantity > 0 ? "in-cart" : "default"}
        data-reduced-motion={reducedMotion ? "true" : "false"}
        onClick={addToCart}
      >
        <CartIcon />
        <span className="add-to-cart__label">{label}</span>
        {quantity > 0 ? (
          <span className="add-to-cart__quantity" aria-label={`${quantity} in cart`}>
            {quantity}
          </span>
        ) : null}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
