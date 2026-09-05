import { Link, useParams } from "react-router-dom";
import { useSiteContent } from "../../app/providers";
import { Seo } from "../../components/Seo";

export function OrderConfirmationPage() {
  const content = useSiteContent();
  const { orderNumber } = useParams();
  const orderId = orderNumber ?? "QL-2048";

  return (
    <section className="page-shell confirmation-page" data-testid="order-confirmation-page">
      <Seo title={content.order.confirmation} description={content.order.confirmation} path={`/order/${orderId}`} noIndex />
      <div className="page-shell__header">
        <p className="eyebrow">{content.order.confirmation}</p>
        <h1>{content.order.confirmation}</h1>
      </div>
      <div className="confirmation-card">
        <p>{content.order.orderNumber}: <strong>{orderId}</strong></p>
        <ul><li>{content.order.statusPending}</li><li>{content.order.paymentPending}</li></ul>
      </div>
      <Link to="/shop" className="primary-button">{content.order.backToShop}</Link>
    </section>
  );
}
