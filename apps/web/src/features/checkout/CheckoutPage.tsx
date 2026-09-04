import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { content } from "../../content/en";
import { Seo } from "../../components/Seo";
import { useCartStore, cartSubtotal } from "../cart/cart-store";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  area: "",
  notes: "",
  payment: "cod",
};

export function CheckoutPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clear);
  const [error, setError] = useState("");

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }
    try {
      const response = await fetch("/api/v1/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerName: form.name, phone: form.phone, email: form.email, addressLine1: form.address, area: form.area, deliveryNotes: form.notes, paymentMethod: form.payment === "cod" ? "COD" : "PAYMENT_LINK", items: items.map(({ id, quantity }) => ({ productId: id, quantity })) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message || "Could not place order");
      clearCart();
      navigate(`/order/${body.orderNumber}`);
    } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : "Could not place order"); }
  }

  return (
    <section className="page-shell checkout-page" data-testid="checkout-page">
      <Seo title="Checkout" description="Submit your QLeaves plant order details." path="/checkout" noIndex />
      <div className="page-shell__header">
        <p className="eyebrow">{content.checkout.title}</p>
        <h1>{content.checkout.guestHeading}</h1>
      </div>

      <p className="page-shell__lead">{content.checkout.guestNotice}</p>

      {error ? <p role="alert">{error}</p> : null}
      <form className="checkout-form" onSubmit={handleSubmit}>
        <div className="checkout-form__grid">
          <label>
            <span>{content.checkout.customerName}</span>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Aisha Rahman"
            />
          </label>

          <label>
            <span>{content.checkout.phone}</span>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="+974 5555 1234"
            />
          </label>

          <label>
            <span>{content.checkout.email}</span>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="hello@example.com"
            />
          </label>

          <label>
            <span>{content.checkout.addressLine1}</span>
            <input
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="Villa 12, Street 30"
            />
          </label>

          <label>
            <span>{content.checkout.area}</span>
            <input
              name="area"
              value={form.area}
              onChange={handleChange}
              placeholder="Doha"
            />
          </label>

          <label>
            <span>{content.checkout.paymentMethod}</span>
            <select name="payment" value={form.payment} onChange={handleChange}>
              <option value="cod">{content.checkout.paymentCod}</option>
              <option value="link">{content.checkout.paymentLink}</option>
            </select>
          </label>

          <label className="checkout-form__full">
            <span>{content.checkout.deliveryNotes}</span>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Ring the bell or leave at reception."
            />
          </label>
        </div>

        <div className="checkout-summary">
          <h2>{content.order.summary}</h2>
          <ul>
            <li>
              <span>{items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</span>
              <strong>{cartSubtotal(items)} QAR</strong>
            </li>
          </ul>
          <div className="checkout-summary__total">
            <span>{content.cart.subtotal}</span>
            <strong>{cartSubtotal(items)} QAR</strong>
          </div>
        </div>

        <button type="submit" className="primary-button" disabled={items.length === 0}>
          {content.checkout.placeOrder}
        </button>
      </form>
    </section>
  );
}
