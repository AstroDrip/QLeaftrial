import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { content } from "../../content/en";
import { Seo } from "../../components/Seo";

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

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate("/order/QL-2048");
  }

  return (
    <section className="page-shell checkout-page" data-testid="checkout-page">
      <Seo title="Checkout" description="Submit your QLeaves plant order details." path="/checkout" noIndex />
      <div className="page-shell__header">
        <p className="eyebrow">{content.checkout.title}</p>
        <h1>{content.checkout.guestHeading}</h1>
      </div>

      <p className="page-shell__lead">{content.checkout.guestNotice}</p>

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
              <span>Monstera Deliciosa</span>
              <strong>320 QAR</strong>
            </li>
            <li>
              <span>Snake Plant × 2</span>
              <strong>480 QAR</strong>
            </li>
          </ul>
          <div className="checkout-summary__total">
            <span>{content.cart.subtotal}</span>
            <strong>800 QAR</strong>
          </div>
        </div>

        <button type="submit" className="primary-button">
          {content.checkout.placeOrder}
        </button>
      </form>
    </section>
  );
}
