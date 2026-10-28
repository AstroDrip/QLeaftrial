import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { Seo } from "../../components/Seo";
import { useCartStore, cartSubtotal } from "../cart/cart-store";
import { errorFromResponse } from "../../lib/api-error";
import { rememberOrderSummary, type OrderSummary } from "./order-summary";
import { FreeDeliveryProgress } from "../cart/FreeDeliveryProgress";

type PlacedOrderResponse = {
  orderNumber: string;
  subtotalQar: number;
  items: Array<{ productId: string; productName: string; quantity: number; unitPriceQar: number }>;
};

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
  const { content, isArabic } = useSiteLanguage();
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
      setError(isArabic ? "سلة المشتريات فارغة." : "Your cart is empty.");
      return;
    }
    try {
      const response = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.name,
          phone: form.phone,
          email: form.email,
          addressLine1: form.address,
          area: form.area,
          deliveryNotes: form.notes,
          paymentMethod: form.payment === "cod" ? "COD" : "PAYMENT_LINK",
          items: items.map(({ id, quantity }) => ({ productId: id, quantity })),
        }),
      });
      if (!response.ok) throw await errorFromResponse(response);
      const body = await response.json() as PlacedOrderResponse;
      const arabicNames = new Map(items.map((item) => [item.id, item.nameAr?.trim() || null]));
      const summary: OrderSummary = {
        orderNumber: body.orderNumber,
        items: body.items.map((item) => ({
          name: item.productName,
          nameAr: arabicNames.get(item.productId) ?? null,
          quantity: item.quantity,
          unitPriceQar: item.unitPriceQar,
        })),
        subtotalQar: body.subtotalQar,
      };
      rememberOrderSummary(summary);
      clearCart();
      navigate(`/order/${body.orderNumber}`, { state: { order: summary } });
    } catch (submissionError) { setError(isArabic ? "تعذر إرسال الطلب" : submissionError instanceof Error ? submissionError.message : "Could not place order"); }
  }

  return (
    <section className="page-shell checkout-page" data-testid="checkout-page">
      <Seo title={content.checkout.title} description={isArabic ? "أرسل تفاصيل طلب نباتات QLeaves." : "Submit your QLeaves plant order details."} path="/checkout" noIndex />
      <div className="page-shell__header">
        <p className="eyebrow">{content.checkout.title}</p>
        <h1>{content.checkout.guestHeading}</h1>
      </div>

      <p className="page-shell__lead">{content.checkout.guestNotice}</p>

      <FreeDeliveryProgress subtotalQar={cartSubtotal(items)} />

      {error ? <p role="alert">{error}</p> : null}
      <form className="checkout-form" onSubmit={handleSubmit}>
        <div className="checkout-form__grid">
          <label>
            <span>{content.checkout.customerName}</span>
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              value={form.name}
              onChange={handleChange}
              placeholder={isArabic ? "عائشة رحمن" : "Aisha Rahman"}
            />
          </label>

          <label>
            <span>{content.checkout.phone}</span>
            <input
              name="phone"
              type="tel"
              required
              minLength={5}
              maxLength={40}
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
              required
              maxLength={200}
              value={form.email}
              onChange={handleChange}
              placeholder="hello@example.com"
            />
          </label>

          <label>
            <span>{content.checkout.addressLine1}</span>
            <input
              name="address"
              required
              minLength={3}
              maxLength={240}
              value={form.address}
              onChange={handleChange}
              placeholder={isArabic ? "فيلا 12، شارع 30" : "Villa 12, Street 30"}
            />
          </label>

          <label>
            <span>{content.checkout.area}</span>
            <select
              name="area"
              value={form.area}
              onChange={handleChange}
              required
            >
              <option value="">{content.checkout.selectDeliveryArea}</option>
              {Object.entries(content.checkout.deliveryAreas).map(([key, label]) => (
                <option key={key} value={label}>{label}</option>
              ))}
            </select>
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
              maxLength={500}
              placeholder={isArabic ? "يرجى قرع الجرس أو ترك الطلب عند الاستقبال." : "Ring the bell or leave at reception."}
            />
          </label>
        </div>

        <div className="checkout-summary">
          <h2>{content.order.summary}</h2>
          <ul>
            <li>
              <span>{items.map((item) => `${isArabic ? item.nameAr?.trim() || item.name : item.name} × ${item.quantity}`).join(isArabic ? "، " : ", ")}</span>
              <strong>{cartSubtotal(items)} QAR</strong>
            </li>
          </ul>
          <div className="checkout-summary__total">
            <span>{content.checkout.total}</span>
            <strong>{cartSubtotal(items)} QAR</strong>
          </div>
        </div>

        <button type="submit" className="primary-button" disabled={items.length === 0}>
          {content.checkout.placeOrder}
        </button>
        <p className="checkout-form__legal">
          {isArabic ? <>بإرسال الطلب، فإنك توافق على <Link to="/terms">الشروط والأحكام</Link> وتقر بالاطلاع على <Link to="/privacy">سياسة الخصوصية</Link> ومعلومات <Link to="/shipping-returns">الشحن والإرجاع</Link>.</> : <>By placing an order, you agree to the <Link to="/terms">Terms &amp; Conditions</Link> and acknowledge the <Link to="/privacy">Privacy Policy</Link> and <Link to="/shipping-returns">Shipping &amp; Returns</Link> information.</>}
        </p>
      </form>
    </section>
  );
}
