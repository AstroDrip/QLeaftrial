import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { Seo } from "../../components/Seo";
import { useCartStore, cartSubtotal } from "../cart/cart-store";
import { ApiClientError } from "../../lib/api-error";
import { acknowledgeSubmission, resumePendingOrder, submitOrder, useOrderSubmission } from "./order-submission";
import { OrderSubmissionPanel } from "./OrderSubmissionPanel";
import { submissionCopy } from "./submission-copy";
import { DeliveryLines } from "./DeliveryLines";
import { LocationPicker, type ResolvedPlace } from "./LocationPicker";
import { emptyLocation, isConfirmed, locationPayload, unconfirm, type DeliveryLocationState, type LocationDetails } from "./delivery-location";
import { deliveryChargeToConfirm } from "../cart/delivery-rules";
import { FreeDeliveryProgress } from "../cart/FreeDeliveryProgress";
import { friendlyError } from "../../lib/friendly-error";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  area: "",
  notes: "",
  payment: "cod",
};

/** The address line written from the pin and the details the customer gave: flat, building, street, zone, area. */
export function composeAddressLine(details: LocationDetails, place: ResolvedPlace | null, isArabic: boolean): string {
  const parts = [
    details.unit.trim(),
    details.building.trim() && (isArabic ? `مبنى ${details.building.trim()}` : `Building ${details.building.trim()}`),
    details.street.trim() || place?.street || "",
    details.zone.trim() && (isArabic ? `منطقة ${details.zone.trim()}` : `Zone ${details.zone.trim()}`),
    details.area.trim() || place?.area || "",
  ].filter(Boolean);
  return [...new Set(parts)].join(isArabic ? "، " : ", ").slice(0, 240);
}

export function CheckoutPage() {
  const { content, isArabic } = useSiteLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const items = useCartStore((state) => state.items);
  const [error, setError] = useState("");
  // The order is sent, retried and recovered by the submission runner (order-submission.ts), which keeps it on this
  // device until QLeaves confirms it. This page only starts it and shows where it stands.
  const submission = useOrderSubmission();
  const submitting = submission.phase === "sending" || submission.phase === "confirming" || submission.phase === "waiting";
  // Delivery location: a confirmed map pin is required, unless the map or address search is not working, in which
  // case the customer may continue with their written address (the order is marked for the team to check).
  const [location, setLocation] = useState<DeliveryLocationState>(emptyLocation);
  const [mapAvailable, setMapAvailable] = useState(true);
  const [writtenOnly, setWrittenOnly] = useState(false);
  const [locationError, setLocationError] = useState("");
  const locationSection = useRef<HTMLDivElement>(null);
  const locationConfirmed = isConfirmed(location);
  const useWrittenAddress = !locationConfirmed && !mapAvailable && writtenOnly;

  // The pin fills the address line and the delivery area. A field is only filled while it is empty or still holds
  // what we filled before; once the customer types in it, it is theirs.
  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  const formNow = useRef(form);
  formNow.current = form;
  const autoAddress = useRef("");
  const autoArea = useRef("");
  const movedHandled = useRef<ResolvedPlace | null>(null);
  useEffect(() => {
    if (!location.selection) return;
    const line = composeAddressLine(location.details, place, isArabic);
    const areaKey = place?.municipality?.key;
    const areaLabel = areaKey ? content.checkout.deliveryAreas[areaKey] : "";
    // A pin in a different neighbourhood makes a hand-edited address line stale too: it is written afresh.
    if (place?.movedArea && movedHandled.current !== place) {
      movedHandled.current = place;
      autoAddress.current = formNow.current.address;
      autoArea.current = formNow.current.area;
    }
    // Decided here, outside the state updater (updaters must stay free of side effects: React may run them twice).
    const current = formNow.current;
    const patch: Partial<typeof initialForm> = {};
    if (line && (!current.address || current.address === autoAddress.current) && current.address !== line) {
      autoAddress.current = line;
      patch.address = line;
    }
    if (areaLabel && (!current.area || current.area === autoArea.current) && current.area !== areaLabel) {
      autoArea.current = areaLabel;
      patch.area = areaLabel;
    }
    if (Object.keys(patch).length) setForm((previous) => ({ ...previous, ...patch }));
  }, [location.selection, location.details, place, isArabic, content.checkout.deliveryAreas]);

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
    if (!locationConfirmed && !useWrittenAddress) {
      setLocationError(isArabic ? "يرجى تحديد موقع التوصيل على الخريطة وتأكيده." : "Please find your delivery location on the map and confirm it.");
      locationSection.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      locationSection.current?.querySelector<HTMLInputElement>("input[role='combobox']")?.focus({ preventScroll: true });
      return;
    }
    setLocationError("");
    const payload = {
      customerName: form.name,
      phone: form.phone,
      email: form.email,
      addressLine1: form.address,
      area: form.area,
      deliveryNotes: form.notes,
      paymentMethod: form.payment === "cod" ? "COD" : "PAYMENT_LINK",
      items: items.map(({ id, quantity }) => ({ productId: id, quantity })),
      ...(locationConfirmed ? { deliveryLocation: locationPayload(location) } : {}),
      ...(useWrittenAddress ? { deliveryLocationManual: true } : {}),
      // The total the customer is looking at: if today's prices differ, the order is not placed and they are told.
      expectedSubtotalQar: cartSubtotal(items),
    };
    await submitOrder(payload, Object.fromEntries(items.map((item) => [item.id, item.nameAr?.trim() || null])));
  }

  // An unfinished order saved on this device (a refresh, a reopened tab) is picked up and sent again.
  useEffect(() => { void resumePendingOrder(); }, []);

  // Confirmed by QLeaves: only now the confirmation page. (The runner has already emptied the cart.)
  useEffect(() => {
    if (submission.phase !== "accepted" || !submission.accepted) return;
    const order = submission.accepted;
    acknowledgeSubmission();
    navigate(`/order/${order.orderNumber}`, { state: { order } });
  }, [submission.phase, submission.accepted, navigate]);

  // A definite answer that needs the customer: the details are still on the form and the cart is untouched.
  useEffect(() => {
    if (submission.phase !== "rejected" || !submission.rejection) return;
    const rejection = submission.rejection;
    acknowledgeSubmission();
    // The server re-checks the pin: outside Qatar or confirmed too long ago means confirming it again.
    if (rejection instanceof ApiClientError && (rejection.code === "LOCATION_OUTSIDE_QATAR" || rejection.code === "LOCATION_CONFIRMATION_STALE")) {
      setLocation((current) => unconfirm(current));
      setLocationError(rejection.code === "LOCATION_OUTSIDE_QATAR"
        ? (isArabic ? "يجب أن يكون موقع التوصيل داخل قطر." : "The delivery location must be in Qatar.")
        : (isArabic ? "يرجى تأكيد موقع التوصيل مرة أخرى." : "Please confirm your delivery location again."));
      // Scrolling is a nicety: where it is not supported it must never break the page.
      locationSection.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      return;
    }
    const copy = submissionCopy[isArabic ? "ar" : "en"];
    if (rejection instanceof ApiClientError && rejection.code === "PRICE_CHANGED") {
      // Today's prices go into the cart, and the customer sees exactly what changed before ordering again.
      const current = Array.isArray(rejection.details?.items) ? rejection.details!.items as Array<{ productId?: unknown; priceQar?: unknown }> : [];
      const prices = new Map(current.filter((item) => typeof item.productId === "string" && typeof item.priceQar === "number").map((item) => [item.productId as string, item.priceQar as number]));
      const cart = useCartStore.getState().items;
      const changes = cart.filter((item) => prices.has(item.id) && prices.get(item.id) !== item.priceQar)
        .map((item) => copy.priceChange(isArabic ? item.nameAr?.trim() || item.name : item.name, item.priceQar, prices.get(item.id)!));
      useCartStore.setState({ items: cart.map((item) => (prices.has(item.id) ? { ...item, priceQar: prices.get(item.id)! } : item)) });
      setError(changes.length ? copy.pricesChanged(changes) : copy.pricesChangedGeneral);
      return;
    }
    if (rejection instanceof ApiClientError && rejection.code === "IDEMPOTENCY_KEY_REUSED") {
      setError(copy.keyReused);
      return;
    }
    setError(friendlyError(rejection, isArabic ? "ar" : "en"));
  }, [submission.phase, submission.rejection, isArabic]);

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

          <div className="checkout-form__full" ref={locationSection}>
            <LocationPicker
              language={isArabic ? "ar" : "en"}
              value={location}
              onChange={(next) => { setLocation(next); if (isConfirmed(next)) setLocationError(""); }}
              onAvailabilityChange={setMapAvailable}
              onResolved={setPlace}
              error={locationError}
            />
            {!mapAvailable && !locationConfirmed ? (
              <label className="checkout-form__fallback">
                <input type="checkbox" checked={writtenOnly} onChange={(event) => setWrittenOnly(event.target.checked)} />
                <span>{isArabic ? "الخريطة لا تعمل الآن. أكمل الطلب بعنواني المكتوب، وسيتواصل الفريق للتأكد من الموقع." : "The map is not working right now. Continue with my written address; the team will contact me to confirm the location."}</span>
              </label>
            ) : null}
          </div>

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

        {submission.phase === "confirming" || submission.phase === "waiting" ? (
          <OrderSubmissionPanel isArabic={isArabic} />
        ) : (
          <button type="submit" className="primary-button" disabled={items.length === 0 || submitting} aria-busy={submitting || undefined}>
            {submitting ? submissionCopy[isArabic ? "ar" : "en"].sending : content.checkout.placeOrder}
          </button>
        )}
        <p className="checkout-form__legal">
          {isArabic ? <>بإرسال الطلب، فإنك توافق على <Link to="/terms">الشروط والأحكام</Link> وتقر بالاطلاع على <Link to="/privacy">سياسة الخصوصية</Link> ومعلومات <Link to="/shipping-returns">الشحن والإرجاع</Link>.</> : <>By placing an order, you agree to the <Link to="/terms">Terms &amp; Conditions</Link> and acknowledge the <Link to="/privacy">Privacy Policy</Link> and <Link to="/shipping-returns">Shipping &amp; Returns</Link> information.</>}
        </p>
      </form>
    </section>
  );
}
