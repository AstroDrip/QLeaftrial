import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { content } from "../../content/en";

type CartItem = {
  id: number;
  name: string;
  priceQar: number;
  quantity: number;
};

const starterItems: CartItem[] = [
  { id: 1, name: "Monstera Deliciosa", priceQar: 320, quantity: 1 },
  { id: 2, name: "Snake Plant", priceQar: 240, quantity: 2 },
];

export function CartPage() {
  const [items, setItems] = useState<CartItem[]>(starterItems);

  const subtotal = useMemo(
    () => items.reduce((total, item) => total + item.priceQar * item.quantity, 0),
    [items],
  );

  function updateQuantity(id: number, nextQuantity: number) {
    setItems((current) =>
      current
        .map((item) =>
          item.id === id ? { ...item, quantity: Math.max(0, nextQuantity) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function removeItem(id: number) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  if (items.length === 0) {
    return (
      <section className="page-shell cart-page cart-page--empty" data-testid="cart-page">
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
                  <input
                    type="number"
                    min={0}
                    value={item.quantity}
                    onChange={(event) =>
                      updateQuantity(item.id, Number(event.target.value))
                    }
                  />
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
              <dt>{content.cart.itemCount(items.length, subtotal)}</dt>
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
