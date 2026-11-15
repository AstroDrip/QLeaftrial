import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminOrder } from "./admin-api";

// Two small admin notes under an order: the delivery charge still to be agreed with the customer (orders below
// the free-delivery threshold), and whether the order's row reached the Google Sheet, with a retry.
export function OrderDeliveryAndSheet({ order, isArabic }: { order: AdminOrder; isArabic: boolean }) {
  const queryClient = useQueryClient();
  const [fee, setFee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const t = isArabic
    ? { pending: "رسوم التوصيل: يجب تأكيدها مع العميل (الطلب أقل من 150 ر.ق)", label: "رسوم التوصيل (ر.ق)", save: "تأكيد الرسوم", saving: "جارٍ الحفظ…", invalid: "أدخل رقمًا صحيحًا من 0 أو أكثر", failed: "تعذر حفظ الرسوم", confirmed: (value: number) => `رسوم التوصيل المؤكدة: ${value} ر.ق`, sheetFailed: "لم يتم تحديث جدول Google لهذا الطلب.", retry: "إعادة المحاولة", retrying: "جارٍ المحاولة…", sheetDone: "تم التحديث في جدول Google" }
    : { pending: "Delivery charge: to confirm with the customer (order below 150 QAR)", label: "Delivery charge (QAR)", save: "Confirm charge", saving: "Saving…", invalid: "Enter a whole number, 0 or more", failed: "Could not save the charge", confirmed: (value: number) => `Delivery charge confirmed: ${value} QAR`, sheetFailed: "This order is not in the Google Sheet yet.", retry: "Retry", retrying: "Retrying…", sheetDone: "In the Google Sheet" };

  // The email that tells the shop about this order: sent, waiting, failed (with a retry), or not set up.
  const e = isArabic
    ? { sent: "تم إرسال بريد الطلب", waiting: "بريد الطلب في انتظار الإرسال", failed: "لم يُرسل بريد الطلب", off: "بريد الطلبات غير مُعدّ", retry: "إعادة الإرسال", retrying: "جارٍ الإرسال…", retryFailed: "تعذّر الإرسال. حاول لاحقًا" }
    : { sent: "Order email sent", waiting: "Order email waiting to be sent", failed: "Order email was not delivered", off: "Order emails are not set up", retry: "Send again", retrying: "Sending…", retryFailed: "Could not send. Try again later" };
  const email = order.notifications?.find((notification) => notification.eventType === "ORDER_CREATED") ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
  const resend = useMutation({ mutationFn: () => adminApi.retryNotification(email!.id), onSettled: refresh });
  const confirm = useMutation({
    mutationFn: (value: number) => adminApi.confirmDeliveryFee(order.id, value),
    onSuccess: () => { setFee(""); setError(null); return refresh(); },
    onError: () => setError(t.failed),
  });
  const retry = useMutation({ mutationFn: () => adminApi.syncOrderToSheet(order.id), onSettled: refresh });

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(fee);
    if (fee.trim() === "" || !Number.isInteger(value) || value < 0) { setError(t.invalid); return; }
    confirm.mutate(value);
  }

  const showDelivery = order.deliveryChargePending || Boolean(order.deliveryFeeConfirmedAt);
  const showSheet = Boolean(order.sheetSyncError) || Boolean(order.sheetSyncedAt);
  if (!showDelivery && !showSheet && !email) return null;

  return (
    <div className="admin-order-extras">
      {order.deliveryChargePending && order.status !== "CANCELLED" ? (
        <form className="admin-order-delivery" onSubmit={submit} data-testid="delivery-charge-form">
          <p className="admin-order-delivery__note" role="note">{t.pending}</p>
          <div className="admin-order-delivery__row">
            <label>
              <span>{t.label}</span>
              <input type="number" inputMode="numeric" min={0} step={1} value={fee} onChange={(event) => setFee(event.target.value)} />
            </label>
            <button type="submit" className="admin-order-extras__button" disabled={confirm.isPending}>{confirm.isPending ? t.saving : t.save}</button>
          </div>
          {error ? <p className="admin-order-extras__error" role="alert">{error}</p> : null}
        </form>
      ) : order.deliveryFeeConfirmedAt ? (
        <p className="admin-order-delivery__done">{t.confirmed(order.deliveryFeeQar)}</p>
      ) : null}
      {order.sheetSyncError ? (
        <div className="admin-order-sheet" role="status">
          <span>{t.sheetFailed}</span>
          <button type="button" className="admin-order-extras__button" onClick={() => retry.mutate()} disabled={retry.isPending}>{retry.isPending ? t.retrying : t.retry}</button>
        </div>
      ) : order.sheetSyncedAt ? (
        <p className="admin-order-sheet admin-order-sheet--ok">{t.sheetDone}</p>
      ) : null}
      {email?.status === "FAILED" ? (
        <div className="admin-order-sheet" role="status" data-testid="order-email-status">
          <span>{resend.isError || resend.data?.status === "FAILED" ? e.retryFailed : e.failed}</span>
          <button type="button" className="admin-order-extras__button" onClick={() => resend.mutate()} disabled={resend.isPending}>{resend.isPending ? e.retrying : e.retry}</button>
        </div>
      ) : email ? (
        <p className="admin-order-sheet admin-order-sheet--ok" data-testid="order-email-status">
          {email.status === "SENT" ? e.sent : email.status === "DISABLED" ? e.off : e.waiting}
        </p>
      ) : null}
    </div>
  );
}
