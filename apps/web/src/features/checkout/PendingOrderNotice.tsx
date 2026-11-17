import "./submission.css";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { acknowledgeSubmission, resumePendingOrder, useOrderSubmission } from "./order-submission";
import { submissionCopy } from "./submission-copy";

/**
 * On every storefront page: picks up an order left unconfirmed on this device (a refresh, a closed tab, a dropped
 * connection) and keeps sending it with its original key. While it is unconfirmed, or once it is confirmed away from
 * checkout, a short notice in the page flow says so. Checkout shows the full panel itself.
 */
export function PendingOrderNotice({ isArabic }: { isArabic: boolean }) {
  const t = submissionCopy[isArabic ? "ar" : "en"];
  const { phase, accepted } = useOrderSubmission();
  const { pathname } = useLocation();

  useEffect(() => { void resumePendingOrder(); }, []);

  if (pathname === "/checkout" || pathname.startsWith("/order/")) return null;
  if (phase === "accepted" && accepted) {
    return (
      <div className="pending-order-notice" role="status" data-testid="pending-order-notice" data-phase="accepted">
        <p>{t.noticeReceived(accepted.orderNumber)}</p>
        <Link to={`/order/${accepted.orderNumber}`} state={{ order: accepted }} onClick={acknowledgeSubmission}>{t.noticeReceivedView}</Link>
      </div>
    );
  }
  if (phase !== "confirming" && phase !== "waiting") return null;
  return (
    <div className="pending-order-notice" role="status" data-testid="pending-order-notice" data-phase={phase}>
      <p>{t.noticeConfirming}</p>
      <Link to="/checkout">{t.noticeView}</Link>
    </div>
  );
}
