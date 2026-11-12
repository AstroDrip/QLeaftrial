import { useSiteLanguage } from "../../app/providers";
import { FREE_DELIVERY_THRESHOLD_QAR } from "../cart/delivery-rules";

// The delivery line, the total and, below the free-delivery threshold, the notice that the QLeaves team will
// confirm the delivery charge. Below the threshold no delivery price is shown or invented: the total is the
// products only, labelled as such, until the team confirms the charge.
export function DeliveryLines({ subtotalQar, pending, placed = false }: { subtotalQar: number; pending: boolean; placed?: boolean }) {
  const { content, isArabic } = useSiteLanguage();
  const t = isArabic
    ? {
        delivery: "التوصيل",
        toConfirm: "سيتم تأكيدها",
        free: "مجاني",
        totalBefore: "الإجمالي قبل التوصيل",
        notice: `للطلبات التي تقل عن ${FREE_DELIVERY_THRESHOLD_QAR} ر.ق، سيتواصل معك فريقنا لتأكيد رسوم التوصيل.`,
        noticePlaced: "سيتواصل معك فريقنا لتأكيد رسوم التوصيل قبل التوصيل.",
      }
    : {
        delivery: "Delivery",
        toConfirm: "To be confirmed",
        free: "Free",
        totalBefore: "Total before delivery",
        notice: `For orders below QAR ${FREE_DELIVERY_THRESHOLD_QAR}, our team will contact you to confirm the delivery charge.`,
        noticePlaced: "Our team will contact you to confirm the delivery charge before delivery.",
      };
  return (
    <>
      <div className="checkout-summary__delivery" data-testid="delivery-line">
        <span>{t.delivery}</span>
        <strong>{pending ? t.toConfirm : t.free}</strong>
      </div>
      <div className="checkout-summary__total">
        <span>{pending ? t.totalBefore : content.checkout.total}</span>
        <strong>{subtotalQar} QAR</strong>
      </div>
      {pending ? <p className="delivery-charge-notice" role="note" data-testid="delivery-charge-notice">{placed ? t.noticePlaced : t.notice}</p> : null}
    </>
  );
}
