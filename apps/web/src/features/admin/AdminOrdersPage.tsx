import { useMemo, useState } from "react";
import { useSiteLanguage } from "../../app/providers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminOrder } from "./admin-api";

const tabs = [
  { status: "PENDING" },
  { status: "CONFIRMED" },
  { status: "CANCELLED" },
  { status: "DELIVERED" },
] as const;

function OrderCard({
  order,
  onStatusChange,
  onPaymentChange,
  onDelete,
}: {
  order: AdminOrder;
  onStatusChange: (id: string, status: string) => void;
  onPaymentChange: (id: string, paymentStatus: string) => void;
  onDelete: (id: string) => void;
}) {
  const { isArabic } = useSiteLanguage();
  const t = isArabic ? { hello: "مرحبًا", regarding: "بخصوص الطلب", accept: "قبول", decline: "رفض", complete: "إكمال", delete: "حذف", payment: "حالة الدفع للطلب", notify: "إشعار عبر واتساب", paymentPending: "الدفع معلق", paid: "مدفوع", failed: "فشل الدفع" } : { hello: "Hello", regarding: "regarding order", accept: "Accept", decline: "Decline", complete: "Complete", delete: "Delete", payment: "Payment status for", notify: "Notify on WhatsApp", paymentPending: "Pending", paid: "Paid", failed: "Failed" };
  const paymentLabels: Record<string, string> = { PENDING: t.paymentPending, PAID: t.paid, FAILED: t.failed };
  const isPending = order.status === "PENDING";
  const isAccepted = order.status === "CONFIRMED";
  const phone = order.phone.replace(/[^\d]/g, "");
  const whatsappMessage = encodeURIComponent(
    `${t.hello} ${order.customerName}، ${t.regarding} ${order.orderNumber}.`,
  );

  return (
    <article className="metric-card" data-testid={`order-${order.orderNumber}`}>
      <div className="admin-order-card__header">
        <div>
          <p className="eyebrow">{order.orderNumber}</p>
          <h2>{order.customerName}</h2>
          <p>{order.phone}</p>
          <p>{order.email}</p>
        </div>
        <strong>{order.subtotalQar} QAR</strong>
      </div>

      <ul>
        {order.items.map((item) => (
          <li key={`${order.id}-${item.productName}`}>
            {item.productName} × {item.quantity} — {item.unitPriceQar * item.quantity} QAR
          </li>
        ))}
      </ul>

      <p>{order.addressLine1}, {order.area}</p>
      {order.deliveryNotes ? <p>{order.deliveryNotes}</p> : null}

      <div className="admin-actions">
        {isPending ? (
          <>
            <button type="button" className="primary-button" onClick={() => onStatusChange(order.id, "CONFIRMED")}>
              {t.accept}
            </button>
            <button type="button" className="primary-button primary-button--secondary" onClick={() => onStatusChange(order.id, "CANCELLED")}>
              {t.decline}
            </button>
          </>
        ) : null}
        {isAccepted ? (
          <>
            <button type="button" className="primary-button" onClick={() => onStatusChange(order.id, "DELIVERED")}>
              {t.complete}
            </button>
            <button type="button" className="primary-button primary-button--secondary" onClick={() => onStatusChange(order.id, "CANCELLED")}>
              {t.decline}
            </button>
          </>
        ) : null}
        {order.status === "CANCELLED" || order.status === "DELIVERED" ? (
          <button type="button" className="primary-button primary-button--danger" onClick={() => onDelete(order.id)}>
            {t.delete}
          </button>
        ) : null}
        <select
          aria-label={`${t.payment} ${order.orderNumber}`}
          value={order.paymentStatus}
          onChange={(event) => onPaymentChange(order.id, event.target.value)}
        >
          {["PENDING", "PAID", "FAILED"].map((paymentStatus) => (
            <option key={paymentStatus} value={paymentStatus}>{paymentLabels[paymentStatus]}</option>
          ))}
        </select>
        <a
          href={`https://wa.me/${phone}?text=${whatsappMessage}`}
          target="_blank"
          rel="noreferrer"
          className="primary-button primary-button--secondary"
        >
          {t.notify}
        </a>
      </div>
    </article>
  );
}

export function AdminOrdersPage() {
  const { content, isArabic } = useSiteLanguage();
  const t = isArabic ? { pending: "معلق", accepted: "مقبول", declined: "مرفوض", completed: "مكتمل", status: "حالة الطلب", loading: "جارٍ تحميل الطلبات…", loadError: "تعذر تحميل الطلبات.", empty: "لا توجد طلبات الآن", deleteOrder: (number: string) => `هل تريد حذف الطلب ${number}؟ لا يمكن التراجع.` } : { pending: "Pending", accepted: "Accepted", declined: "Declined", completed: "Completed", status: "Order status", loading: "Loading orders…", loadError: "Could not load orders.", empty: "No orders right now", deleteOrder: (number: string) => `Delete order ${number}? This cannot be undone.` };
  const tabLabels: Record<(typeof tabs)[number]["status"], string> = { PENDING: t.pending, CONFIRMED: t.accepted, CANCELLED: t.declined, DELIVERED: t.completed };
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["status"]>("PENDING");
  const orders = useQuery({ queryKey: ["admin", "orders"], queryFn: adminApi.orders });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminApi.updateOrderStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "orders"] });
      const previous = queryClient.getQueryData<AdminOrder[]>(["admin", "orders"]);
      queryClient.setQueryData<AdminOrder[]>(["admin", "orders"], (current = []) =>
        current.map((order) => order.id === id ? { ...order, status } : order),
      );
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin", "orders"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });

  const updatePayment = useMutation({
    mutationFn: ({ id, paymentStatus }: { id: string; paymentStatus: string }) =>
      adminApi.updatePaymentStatus(id, paymentStatus),
    onMutate: async ({ id, paymentStatus }) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "orders"] });
      const previous = queryClient.getQueryData<AdminOrder[]>(["admin", "orders"]);
      queryClient.setQueryData<AdminOrder[]>(["admin", "orders"], (current = []) =>
        current.map((order) => order.id === id ? { ...order, paymentStatus } : order),
      );
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin", "orders"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });

  const deleteOrder = useMutation({
    mutationFn: adminApi.deleteOrder,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "orders"] });
      const previous = queryClient.getQueryData<AdminOrder[]>(["admin", "orders"]);
      queryClient.setQueryData<AdminOrder[]>(["admin", "orders"], (current = []) =>
        current.filter((order) => order.id !== id),
      );
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin", "orders"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });

  const deleteVisibleOrders = useMutation({
    mutationFn: () => adminApi.deleteOrders(filteredOrders.map((order) => order.id)),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["admin", "orders"] });
      const previous = queryClient.getQueryData<AdminOrder[]>(["admin", "orders"]);
      queryClient.setQueryData<AdminOrder[]>(["admin", "orders"], (current = []) =>
        current.filter((order) => !filteredOrders.some((visible) => visible.id === order.id)),
      );
      return { previous };
    },
    onError: (_, __, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["admin", "orders"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
  });

  function handleDelete(order: AdminOrder) {
    if (window.confirm(t.deleteOrder(order.orderNumber))) {
      deleteOrder.mutate(order.id);
    }
  }

  const filteredOrders = useMemo(
    () => orders.data?.filter((order) => order.status === activeTab) ?? [],
    [activeTab, orders.data],
  );

  return (
    <section className="page-shell admin-page" data-testid="admin-orders-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.orders}</p>
        <h1>{content.admin.orders}</h1>
      </div>

      <div className="admin-order-toolbar">
        <div className="admin-order-tabs" role="tablist" aria-label={t.status}>
          {tabs.map((tab) => {
            const count = orders.data?.filter((order) => order.status === tab.status).length ?? 0;
            return (
              <button
                key={tab.status}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.status}
                className={activeTab === tab.status ? "primary-button" : "primary-button primary-button--secondary"}
                onClick={() => setActiveTab(tab.status)}
              >
                {tabLabels[tab.status]} ({count})
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="primary-button primary-button--secondary admin-delete-all"
          disabled={!filteredOrders.length || deleteVisibleOrders.isPending}
          onClick={() => {
            if (window.confirm(content.common.deleteAllPrompt)) {
              deleteVisibleOrders.mutate();
            }
          }}
        >
          {content.common.deleteAll}
        </button>
      </div>

      {orders.isPending ? <p>{t.loading}</p> : null}
      {orders.isError ? <p role="alert">{t.loadError}</p> : null}
      {!orders.isPending && filteredOrders.length === 0 ? (
        <div className="table-card">
          <p>{t.empty}</p>
        </div>
      ) : null}
      <div className="admin-order-list">
        {filteredOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            onStatusChange={(id, status) => update.mutate({ id, status })}
            onPaymentChange={(id, paymentStatus) => updatePayment.mutate({ id, paymentStatus })}
            onDelete={(id) => {
              const order = orders.data?.find((item) => item.id === id);
              if (order) handleDelete(order);
            }}
          />
        ))}
      </div>
    </section>
  );
}
