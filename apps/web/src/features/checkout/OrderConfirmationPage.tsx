import { Link, useLocation, useParams } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { Seo } from "../../components/Seo";
import { recallOrderSummary } from "./order-summary";

export function OrderConfirmationPage() {
  const { content, isArabic } = useSiteLanguage();
  const { orderNumber } = useParams();
  const location = useLocation();
  const summary = recallOrderSummary(orderNumber, location.state);

  return (
    <section className="page-shell confirmation-page" data-testid="order-confirmation-page">
      <Seo title={isArabic ? "تم استلام الطلب" : "Order received"} description={isArabic ? "تأكيد طلبك من QLeaves." : "Your QLeaves order confirmation."} path={`/order/${orderNumber ?? ""}`} noIndex />
      <div className="page-shell__header">
        <p className="eyebrow">{content.order.confirmation}</p>
        <h1>{content.order.confirmation}</h1>
      </div>

      <div className="confirmation-card">
        <p>
          {content.order.orderNumber}: <strong>{orderNumber}</strong>
        </p>
        <ul>
          <li>{content.order.statusPending}</li>
          <li>{content.order.paymentPending}</li>
        </ul>
      </div>

      {summary ? (
        <div className="confirmation-summary">
          <h2>{content.order.summary}</h2>
          <ul>
            {summary.items.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <span>{(isArabic ? item.nameAr || item.name : item.name)}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</span>
                <strong>{item.unitPriceQar * item.quantity} QAR</strong>
              </li>
            ))}
            <li>
              <span>{content.order.subtotal}</span>
              <strong>{summary.subtotalQar} QAR</strong>
            </li>
          </ul>
          <div className="checkout-summary__total">
            <span>{content.checkout.total}</span>
            <strong>{summary.subtotalQar} QAR</strong>
          </div>
        </div>
      ) : (
        <p className="page-shell__lead">
          {isArabic
            ? "استلمنا طلبك. سنتواصل معك لتأكيد التفاصيل والإجمالي."
            : "We have received your order. We will contact you to confirm the details and total."}
        </p>
      )}

      <Link to="/shop" className="primary-button">
        {content.order.backToShop}
      </Link>
    </section>
  );
}
