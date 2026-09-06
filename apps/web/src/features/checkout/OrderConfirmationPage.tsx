import { Link, useParams } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { Seo } from "../../components/Seo";

export function OrderConfirmationPage() {
  const { content, isArabic } = useSiteLanguage();
  const { orderNumber } = useParams();
  const orderId = orderNumber ?? "QL-2048";

  return (
    <section className="page-shell confirmation-page" data-testid="order-confirmation-page">
      <Seo title={isArabic ? "تم استلام الطلب" : "Order received"} description={isArabic ? "تأكيد طلبك من QLeaves." : "Your QLeaves order confirmation."} path={`/order/${orderId}`} noIndex />
      <div className="page-shell__header">
        <p className="eyebrow">{content.order.confirmation}</p>
        <h1>{content.order.confirmation}</h1>
      </div>

      <div className="confirmation-card">
        <p>
          {content.order.orderNumber}: <strong>{orderId}</strong>
        </p>
        <ul>
          <li>{content.order.statusPending}</li>
          <li>{content.order.paymentPending}</li>
        </ul>
      </div>

      <div className="confirmation-summary">
        <h2>{content.order.summary}</h2>
        <ul>
          <li>
            <span>{isArabic ? "مونستيرا ديليسيوسا" : "Monstera Deliciosa"}</span>
            <strong>320 QAR</strong>
          </li>
          <li>
            <span>{isArabic ? "نبات الثعبان × 2" : "Snake Plant × 2"}</span>
            <strong>480 QAR</strong>
          </li>
        </ul>
        <div className="checkout-summary__total">
          <span>{content.order.subtotal}</span>
          <strong>800 QAR</strong>
        </div>
      </div>

      <Link to="/shop" className="primary-button">
        {content.order.backToShop}
      </Link>
    </section>
  );
}
