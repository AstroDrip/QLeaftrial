import { useMemo, useState } from "react";
import { content } from "../../content/en";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type AdminOrder } from "./admin-api";

const tabs = [
  { status: "PENDING", label: "Pending" },
  { status: "CONFIRMED", label: "Accepted" },
  { status: "CANCELLED", label: "Declined" },
  { status: "DELIVERED", label: "Completed" },
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
  const isPending = order.status === "PENDING";
  const isAccepted = order.status === "CONFIRMED";
  const phone = order.phone.replace(/[^\d]/g, "");
  const whatsappMessage = encodeURIComponent(
    `Hello ${order.customerName}, regarding order ${order.orderNumber}.`,
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
              Accept
            </button>
            <button type="button" className="primary-button primary-button--secondary" onClick={() => onStatusChange(order.id, "CANCELLED")}>
              Decline
            </button>
          </>
        ) : null}
        {isAccepted ? (
          <>
            <button type="button" className="primary-button" onClick={() => onStatusChange(order.id, "DELIVERED")}>
              Complete
            </button>
            <button type="button" className="primary-button primary-button--secondary" onClick={() => onStatusChange(order.id, "CANCELLED")}>
              Decline
            </button>
          </>
        ) : null}
        {order.status === "CANCELLED" || order.status === "DELIVERED" ? (
          <button type="button" className="primary-button primary-button--danger" onClick={() => onDelete(order.id)}>
            Delete
          </button>
        ) : null}
        <select
          aria-label={`Payment status for ${order.orderNumber}`}
          value={order.paymentStatus}
          onChange={(event) => onPaymentChange(order.id, event.target.value)}
        >
          {["PENDING", "PAID", "FAILED"].map((paymentStatus) => (
            <option key={paymentStatus}>{paymentStatus}</option>
          ))}
        </select>
        <a
          href={`https://wa.me/${phone}?text=${whatsappMessage}`}
          target="_blank"
          rel="noreferrer"
          className="primary-button primary-button--secondary"
        >
          Notify on WhatsApp
        </a>
      </div>
    </article>
  );
}

export function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["status"]>("PENDING");
  const orders = useQuery({ queryKey: ["admin", "orders"], queryFn: adminApi.orders });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminApi.updateOrderStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
  });
  const updatePayment = useMutation({
    mutationFn: ({ id, paymentStatus }: { id: string; paymentStatus: string }) =>
      adminApi.updatePaymentStatus(id, paymentStatus),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
  });
  const deleteOrder = useMutation({
    mutationFn: adminApi.deleteOrder,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
  });
  function handleDelete(order: AdminOrder) {
    if (window.confirm(`Delete order ${order.orderNumber}? This cannot be undone.`)) {
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

      <div className="admin-order-tabs" role="tablist" aria-label="Order status">
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
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {orders.isPending ? <p>Loading orders…</p> : null}
      {orders.isError ? <p role="alert">Could not load orders.</p> : null}
      {!orders.isPending && filteredOrders.length === 0 ? (
        <div className="table-card">
          <p>No {tabs.find((tab) => tab.status === activeTab)?.label.toLowerCase()} orders right now.</p>
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
