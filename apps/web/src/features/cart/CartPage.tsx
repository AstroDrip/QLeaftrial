import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { cartSubtotal, useCartStore } from "./cart-store";
import { Seo } from "../../components/Seo";
import { DeliveryNote } from "./DeliveryNote";
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

export function CartPage() {
  const { content, isArabic } = useSiteLanguage();
  const items = useCartStore((state) => state.items);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  const subtotal = useMemo(() => cartSubtotal(items), [items]);

  if (items.length === 0) {
    return (
      <section className="page-shell cart-page cart-page--empty" data-testid="cart-page">
        <Seo title={content.cart.title} description={isArabic ? "راجع سلة نباتات QLeaves." : "Review your QLeaves plant cart."} path="/cart" noIndex />
        <div className="page-shell__header">
          <p className="eyebrow">{content.cart.title}</p>
          <h1>{content.cart.emptyHeading}</h1>
        </div>
        <p className="page-shell__lead">{content.cart.emptyMessage}</p>
        <Link to="/shop" className="primary-button">
          {content.cart.continueShopping}
        </Link>
      </section>
    );
  }

  return (
    <section className="page-shell cart-page" data-testid="cart-page">
      <Seo title={content.cart.title} description={isArabic ? "راجع سلة نباتات QLeaves." : "Review your QLeaves plant cart."} path="/cart" noIndex />
      <div className="page-shell__header">
        <p className="eyebrow">{content.cart.title}</p>
        <h1>{content.cart.title}</h1>
      </div>

      <DeliveryNote />

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
          <Link to="/checkout" className="primary-button">
            {content.cart.checkout}
          </Link>
        </aside>
      </div>
    </section>
  );
}
