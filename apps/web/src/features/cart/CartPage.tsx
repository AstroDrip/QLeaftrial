import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { content } from "../../content/en";
import { cartSubtotal, useCartStore } from "./cart-store";
import { Seo } from "../../components/Seo";

function CartQuantity({ id, name, quantity, stock, onCommit }: { id: string; name: string; quantity: number; stock: number; onCommit: (id: string, quantity: number) => void }) {
  const [draft, setDraft] = useState(String(quantity));
  useEffect(() => setDraft(String(quantity)), [quantity]);
  return <input
    aria-label={`${name} ${content.cart.quantity}`}
    type="number"
    min={0}
    max={stock}
    step={1}
    value={draft}
    onChange={(event) => {
      const value = event.target.value;
      setDraft(value);
      if (value.trim() !== "" && Number.isInteger(Number(value))) onCommit(id, Number(value));
    }}
    onBlur={() => { if (draft.trim() === "") setDraft(String(quantity)); }}
  />;
}

export function CartPage() {
  const items = useCartStore((state) => state.items);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  const subtotal = useMemo(() => cartSubtotal(items), [items]);
  const itemCount = useMemo(() => items.reduce((total, item) => total + item.quantity, 0), [items]);

  if (items.length === 0) {
    return (
      <section className="page-shell cart-page cart-page--empty" data-testid="cart-page">
        <Seo title="Cart" description="Review your QLeaves plant cart." path="/cart" noIndex />
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
      <Seo title="Cart" description="Review your QLeaves plant cart." path="/cart" noIndex />
      <div className="page-shell__header">
        <p className="eyebrow">{content.cart.title}</p>
        <h1>{content.cart.title}</h1>
      </div>

      <div className="cart-layout">
        <div className="cart-list" aria-label={content.cart.title}>
          {items.map((item) => (
            <article key={item.id} className="cart-item">
              <div className="cart-item__copy">
                <h2>{item.name}</h2>
                <p>{item.priceQar} QAR each</p>
              </div>

              <div className="cart-item__actions">
                <label>
                  <span className="sr-only">{content.cart.quantity}</span>
                  <CartQuantity id={item.id} name={item.name} quantity={item.quantity} stock={item.stock} onCommit={setQuantity} />
                </label>
                <button type="button" onClick={() => removeItem(item.id)}>
                  {content.cart.remove}
                </button>
              </div>
            </article>
          ))}
        </div>

        <aside className="order-summary">
          <h2>{content.order.summary}</h2>
          <dl>
            <div>
              <dt>{content.cart.itemCount(itemCount, subtotal)}</dt>
              <dd>{subtotal} QAR</dd>
            </div>
            <div>
              <dt>{content.cart.subtotal}</dt>
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
