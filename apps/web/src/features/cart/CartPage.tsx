import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { cartSubtotal, useCartStore } from "./cart-store";
import { Seo } from "../../components/Seo";
import { FreeDeliveryProgress } from "./FreeDeliveryProgress";
import { TrashIcon } from "../../components/icons";

// A minus and a plus on either side of the number; the number can still be typed over.
function CartQuantity({ id, name, quantity, stock, onCommit, quantityLabel, decreaseLabel, increaseLabel }: { id: string; name: string; quantity: number; stock: number; onCommit: (id: string, quantity: number) => void; quantityLabel: string; decreaseLabel: string; increaseLabel: string }) {
  const [draft, setDraft] = useState(String(quantity));
  useEffect(() => setDraft(String(quantity)), [quantity]);
  return (
    <div className="quantity-stepper" role="group" aria-label={`${name} ${quantityLabel}`}>
      <button type="button" aria-label={`${decreaseLabel} ${name}`} disabled={quantity <= 1} onClick={() => onCommit(id, quantity - 1)}>−</button>
      <input
        aria-label={`${name} ${quantityLabel}`}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onChange={(event) => {
          const value = event.target.value;
          if (!/^\d*$/.test(value)) return;
          setDraft(value);
          if (value !== "") onCommit(id, Number(value));
        }}
        onBlur={() => { if (draft.trim() === "") setDraft(String(quantity)); }}
      />
      <button type="button" aria-label={`${increaseLabel} ${name}`} disabled={quantity >= stock} onClick={() => onCommit(id, quantity + 1)}>+</button>
    </div>
  );
}

// How long the cart takes to slide away before the previous page takes its place (matches the CSS).
const LEAVE_MS = 300;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

// The cart page slides in from the side the reader's eye starts on the far edge of (right in English, left in
// Arabic). The close button and Escape slide it back out, then return to the page the customer came from
// (or the shop if they arrived here directly). The browser's own Back button still works as normal.
function useCartSheet() {
  const navigate = useNavigate();
  const location = useLocation();
  const [leaving, setLeaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useCallback(() => {
    if (leaving) return;
    const goBack = () => (location.key !== "default" ? navigate(-1) : navigate("/shop"));
    if (prefersReducedMotion()) { goBack(); return; }
    setLeaving(true);
    window.setTimeout(goBack, LEAVE_MS);
  }, [leaving, location.key, navigate]);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Escape inside a field (or an open menu) belongs to that control.
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [role='dialog'], .site-menu[data-open='true']")) return;
      if (document.querySelector(".site-header--menu-open, .header-search--open")) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return { leaving, close, heading };
}

function CloseCart({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <button type="button" className="cart-page__close" aria-label={label} onClick={onClose} data-testid="cart-close">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  );
}

export function CartPage() {
  const { content, isArabic } = useSiteLanguage();
  const items = useCartStore((state) => state.items);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const { leaving, close, heading } = useCartSheet();
  const sheetClass = `cart-page--sheet${leaving ? " is-leaving" : ""}`;
  const closeLabel = isArabic ? "إغلاق السلة" : "Close cart";

  const subtotal = useMemo(() => cartSubtotal(items), [items]);

  if (items.length === 0) {
    return (
      <section className={`page-shell cart-page cart-page--empty ${sheetClass}`} data-testid="cart-page">
        <Seo title={content.cart.title} description={isArabic ? "راجع سلة نباتات QLeaves." : "Review your QLeaves plant cart."} path="/cart" noIndex />
        <div className="page-shell__header cart-page__header">
          <div>
            <p className="eyebrow">{content.cart.title}</p>
            <h1 ref={heading} tabIndex={-1}>{content.cart.emptyHeading}</h1>
          </div>
          <CloseCart onClose={close} label={closeLabel} />
        </div>
        <p className="page-shell__lead">{content.cart.emptyMessage}</p>
        <Link to="/shop" className="primary-button">
          {content.cart.continueShopping}
        </Link>
      </section>
    );
  }

  return (
    <section className={`page-shell cart-page ${sheetClass}`} data-testid="cart-page">
      <Seo title={content.cart.title} description={isArabic ? "راجع سلة نباتات QLeaves." : "Review your QLeaves plant cart."} path="/cart" noIndex />
      <div className="page-shell__header cart-page__header">
        <div>
          <p className="eyebrow">{content.cart.title}</p>
          <h1 ref={heading} tabIndex={-1}>{content.cart.title}</h1>
        </div>
        <CloseCart onClose={close} label={closeLabel} />
      </div>

      <div className="cart-layout">
        <div className="cart-list" aria-label={content.cart.title}>
          {items.map((item) => (
            <article key={item.id} className="cart-item">
              <div className="cart-item__copy">
                <h2>{isArabic ? item.nameAr?.trim() || item.name : item.name}</h2>
                <p>{item.priceQar} QAR {isArabic ? "للقطعة" : "each"}</p>
              </div>

              <div className="cart-item__actions">
                <CartQuantity id={item.id} name={isArabic ? item.nameAr?.trim() || item.name : item.name} quantity={item.quantity} stock={item.stock} onCommit={setQuantity} quantityLabel={content.cart.quantity} decreaseLabel={isArabic ? "إنقاص" : "Decrease"} increaseLabel={isArabic ? "زيادة" : "Increase"} />
                <button type="button" className="cart-item__remove" aria-label={`${content.cart.remove}: ${isArabic ? item.nameAr?.trim() || item.name : item.name}`} title={content.cart.remove} onClick={() => removeItem(item.id)}>
                  <TrashIcon />
                </button>
              </div>
            </article>
          ))}
        </div>

        <aside className="order-summary">
          <h2>{content.order.summary}</h2>
          <dl>
            <div>
              <dt>{content.cart.total}</dt>
              <dd>{subtotal} QAR</dd>
            </div>
          </dl>
          {/* Delivery progress lives with the totals it depends on, at the summary's width. */}
          <FreeDeliveryProgress subtotalQar={subtotal} placement="summary" />
          <Link to="/checkout" className="primary-button">
            {content.cart.checkout}
          </Link>
        </aside>
      </div>
    </section>
  );
}
