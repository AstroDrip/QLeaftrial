import { useEffect, useRef, useState } from "react";
import type { ProductSummary } from "../catalog/product-types";
import { useCartStore } from "./cart-store";
import "./AddToCartButton.css";
import { useSiteLanguage } from "../../app/providers";
import { localizeProduct } from "../catalog/localize-product";

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
  const { content, isArabic } = useSiteLanguage();
  const localizedProduct = localizeProduct(product, isArabic);
  const setQuantity = useCartStore((state) => state.setQuantity);
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
      setAnnouncement(isArabic ? `تعذر إضافة ${localizedProduct.name} لأن كل المخزون المتاح موجود في السلة` : `${product.name} could not be added because the available stock is already in your cart`);
      return;
    }

    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    setIsConfirming(true);
    setAnnouncement(isArabic ? `تمت إضافة ${localizedProduct.name} إلى السلة` : `${product.name} added to cart`);
    confirmationTimer.current = setTimeout(() => {
      confirmationTimer.current = null;
      setIsConfirming(false);
    }, CONFIRMATION_MS);
  }

  function decrement() {
    setQuantity(product.id, quantity - 1);
    setAnnouncement(isArabic ? `تم تقليل كمية ${localizedProduct.name}` : `${product.name} quantity decreased`);
  }

  const label = isConfirming
    ? (isArabic ? "تمت الإضافة ✓" : "Added ✓")
    : outOfStock
      ? content.product.outOfStock
      : maxInCart
        ? (isArabic ? "الحد الأقصى في السلة" : "Max in cart")
        : content.product.addToCart;

  const accessibleName = outOfStock
    ? (isArabic ? `${localizedProduct.name} غير متوفر` : `${product.name} is out of stock`)
    : maxInCart
      ? (isArabic ? `الحد الأقصى من ${localizedProduct.name} موجود في السلة` : `Maximum stock of ${product.name} is already in cart`)
      : (isArabic ? `أضف ${localizedProduct.name} إلى السلة` : `Add ${product.name} to cart`);

  return (
    <div className={`add-to-cart__controls${quantity > 0 ? " add-to-cart__controls--with-decrement" : ""}`}>
      {quantity > 0 ? (
        <button
          type="button"
          className="add-to-cart__decrement"
          aria-label={isArabic ? `تقليل كمية ${localizedProduct.name}` : `Decrease ${product.name} quantity`}
          onClick={decrement}
        >
          −
        </button>
      ) : null}
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
          <span className="add-to-cart__quantity" aria-label={isArabic ? `${quantity} في السلة` : `${quantity} in cart`}>
            {quantity}
          </span>
        ) : null}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
