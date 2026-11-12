import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { Seo } from "../../components/Seo";
import { useCartStore, cartSubtotal } from "../cart/cart-store";
import { errorFromResponse } from "../../lib/api-error";
import { rememberOrderSummary, type OrderSummary } from "./order-summary";
import { DeliveryLines } from "./DeliveryLines";
import { deliveryChargeToConfirm } from "../cart/delivery-rules";
import { FreeDeliveryProgress } from "../cart/FreeDeliveryProgress";
import { friendlyError } from "../../lib/friendly-error";

type PlacedOrderResponse = {
  orderNumber: string;
  subtotalQar: number;
  deliveryChargePending?: boolean;
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

// One key per checkout attempt for this cart. A retry after a timeout or a dropped connection sends the
// same key, so the server returns the order it already saved instead of placing a second one. Changing
// the cart starts a fresh attempt.
function newAttemptKey(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `checkout-${random}`;
}

export function CheckoutPage() {
  const { content, isArabic } = useSiteLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clear);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const attempt = useRef<{ cart: string; key: string } | null>(null);

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
    if (submitting) return;
    const cart = JSON.stringify(items.map(({ id, quantity }) => [id, quantity]));
    if (!attempt.current || attempt.current.cart !== cart) attempt.current = { cart, key: newAttemptKey() };
    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.current.key },
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
        deliveryChargePending: body.deliveryChargePending === true,
      };
      rememberOrderSummary(summary);
      attempt.current = null;
      clearCart();
      navigate(`/order/${body.orderNumber}`, { state: { order: summary } });
    } catch (submissionError) {
      setError(friendlyError(submissionError, isArabic ? "ar" : "en"));
    } finally {
      setSubmitting(false);
    }
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
          <DeliveryLines subtotalQar={cartSubtotal(items)} pending={deliveryChargeToConfirm(cartSubtotal(items))} />
        </div>

        <button type="submit" className="primary-button" disabled={items.length === 0 || submitting} aria-busy={submitting || undefined}>
          {submitting ? content.checkout.submitting : content.checkout.placeOrder}
        </button>
        <p className="checkout-form__legal">
          {isArabic ? <>بإرسال الطلب، فإنك توافق على <Link to="/terms">الشروط والأحكام</Link> وتقر بالاطلاع على <Link to="/privacy">سياسة الخصوصية</Link> ومعلومات <Link to="/shipping-returns">الشحن والإرجاع</Link>.</> : <>By placing an order, you agree to the <Link to="/terms">Terms &amp; Conditions</Link> and acknowledge the <Link to="/privacy">Privacy Policy</Link> and <Link to="/shipping-returns">Shipping &amp; Returns</Link> information.</>}
        </p>
      </form>
    </section>
  );
}
