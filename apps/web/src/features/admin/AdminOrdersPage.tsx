import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { OrderStatusTabs, type StatusTab } from "./OrderStatusTabs";
import { describeDraftChanges, whatsappText } from "./order-messages";
import { useSiteLanguage } from "../../app/providers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  type AdminOrder,
  type AdminOrderItem,
  type AdminProduct,
  type EditedOrderLine,
} from "./admin-api";

const tabs = [
  { status: "PENDING" },
  { status: "CONFIRMED" },
  { status: "CANCELLED" },
  { status: "DELIVERED" },
] as const;

type OrderTab = (typeof tabs)[number]["status"];

const TAB_TONES: Record<OrderTab, StatusTab<OrderTab>["tone"]> = {
  PENDING: "pending",
  CONFIRMED: "accepted",
  CANCELLED: "declined",
  DELIVERED: "completed",
};

// Preparing and out-for-delivery orders are still accepted orders, so they share
// the Accepted tab instead of disappearing from every tab.
const acceptedStatuses = new Set(["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"]);

function tabForStatus(status: string): OrderTab | null {
  if (acceptedStatuses.has(status)) return "CONFIRMED";
  return tabs.find((tab) => tab.status === status)?.status ?? null;
}

function formatQatarDateTime(value: string, arabic: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(arabic ? "ar-QA-u-nu-latn" : "en-GB", {
    timeZone: "Asia/Qatar",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function paymentMethodLabel(paymentMethod: AdminOrder["paymentMethod"]): string {
  return paymentMethod === "COD" ? "Cash on delivery" : "Payment link";
}

function lineUnitPrice(
  item: AdminOrderItem,
  draft: EditedOrderLine,
  products: AdminProduct[],
): number {
  if (draft.productId === item.productId) return item.unitPriceQar;
  return products.find((product) => product.id === draft.productId)?.priceQar ?? item.unitPriceQar;
}

function initialDraft(order: AdminOrder): EditedOrderLine[] {
  return order.items.map((item) => ({
    orderItemId: item.id,
    included: true,
    productId: item.productId,
    quantity: item.quantity,
  }));
}

function OrderCard({
  order,
  products,
  onStatusChange,
  onPaymentChange,
  onAcceptEdited,
  onDelete,
  acceptingEdited,
}: {
  order: AdminOrder;
  products: AdminProduct[];
  onStatusChange: (id: string, status: string) => void;
  onPaymentChange: (id: string, paymentStatus: string) => void;
  onAcceptEdited: (id: string, items: EditedOrderLine[]) => void;
  onDelete: (id: string) => void;
  acceptingEdited: boolean;
}) {
  const { content, language, isArabic } = useSiteLanguage();
  const stageLabels: Record<string, string> = { PREPARING: content.order.statusPreparing, OUT_FOR_DELIVERY: content.order.statusOutForDelivery };
  const t = isArabic ? { hello: "مرحبًا", regarding: "بخصوص الطلب", accept: "قبول", decline: "رفض", complete: "إكمال", delete: "حذف", payment: "حالة الدفع للطلب", notify: "إشعار عبر واتساب", invoice: "الفاتورة", paid: "مدفوع", notPaid: "غير مدفوع", markPaid: "اضغط لتحديده كمدفوع", markNotPaid: "اضغط لتحديده كغير مدفوع" } : { hello: "Hello", regarding: "regarding order", accept: "Accept", decline: "Decline", complete: "Complete", delete: "Delete", payment: "Payment status for", notify: "Notify on WhatsApp", invoice: "Invoice", paid: "Paid", notPaid: "Not paid", markPaid: "Click to mark as paid", markNotPaid: "Click to mark as not paid" };
  const isPaid = order.paymentStatus === "PAID";
  const isPending = order.status === "PENDING";
  const isAccepted = acceptedStatuses.has(order.status);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<EditedOrderLine[]>(() => initialDraft(order));
  const itemFingerprint = order.items
    .map((item) => `${item.id}:${item.productId}:${item.quantity}:${item.unitPriceQar}`)
    .join("|");

  useEffect(() => {
    setDraft(initialDraft(order));
    if (!isPending) setExpanded(false);
  }, [itemFingerprint, isPending, order.id]);

  const draftById = useMemo(
    () => new Map(draft.map((line) => [line.orderItemId, line])),
    [draft],
  );

  const includedTotal = useMemo(
    () => order.items.reduce((total, item) => {
      const edit = draftById.get(item.id);
      if (!edit?.included) return total;
      return total + lineUnitPrice(item, edit, products) * edit.quantity;
    }, 0),
    [draftById, order.items, products],
  );

  const includedCount = draft.filter((line) => line.included).length;
  const phone = order.phone.replace(/[^\d]/g, "");
  // A pending order's message lists whatever is currently changed in the editor; once accepted it
  // lists the changes the shop saved, and includes the customer's invoice link.
  const draftChanges = isPending ? describeDraftChanges(order.items, draft, products) : [];
  const whatsappMessage = encodeURIComponent(whatsappText({
    order,
    language,
    origin: window.location.origin,
    pending: isPending ? { changes: draftChanges, total: includedTotal } : undefined,
  }));

  function updateDraft(orderItemId: string, patch: Partial<EditedOrderLine>) {
    setDraft((current) => current.map((line) =>
      line.orderItemId === orderItemId ? { ...line, ...patch } : line,
    ));
  }

  return (
    <article className="admin-order-card" data-testid={`order-${order.orderNumber}`}>
      <div className="admin-order-card__header">
        <div className="admin-order-card__who">
          <p className="admin-order-card__ref">
            <span>{order.orderNumber}</span>
            <time dateTime={order.createdAt}>{formatQatarDateTime(order.createdAt, isArabic)}</time>
            {stageLabels[order.status] ? <span className="status-pill">{stageLabels[order.status]}</span> : null}
          </p>
          <h2>{order.customerName}</h2>
          <p className="admin-order-card__contact">
            <a href={`tel:${order.phone}`}>{order.phone}</a>
            <a href={`mailto:${order.email}`}>{order.email}</a>
          </p>
        </div>
        <div className="admin-order-card__total">
          <strong>{order.subtotalQar + order.deliveryFeeQar} QAR</strong>
          <span>{paymentMethodLabel(order.paymentMethod)}</span>
        </div>
      </div>

      <ul className="admin-order-summary-lines">
        {order.items.map((item) => (
          <li key={item.id}>
            <span>{item.productName} × {item.quantity}</span>
            <strong>{item.unitPriceQar * item.quantity} QAR</strong>
          </li>
        ))}
      </ul>

      <p className="admin-order-address">{order.addressLine1}, {order.area}</p>
      {order.deliveryNotes ? (
        <p className="admin-order-note"><strong>Customer note:</strong> {order.deliveryNotes}</p>
      ) : null}

      {isPending ? (
        <div className="admin-order-options">
          <button
            type="button"
            className="admin-order-expand"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <span>{expanded ? "Hide order options" : "Order options"}</span>
            <span aria-hidden="true" className={expanded ? "admin-order-expand__icon is-open" : "admin-order-expand__icon"} />
          </button>

          {expanded ? (
            <div className="admin-order-editor">
              <div className="admin-order-editor__heading">
                <div>
                  <p className="eyebrow">Pending order editor</p>
                  <h3>Choose exactly what can be fulfilled</h3>
                </div>
                <div>
                  <span>Included total</span>
                  <strong>{includedTotal} QAR</strong>
                </div>
              </div>

              <div className="admin-order-editor__lines">
                {order.items.map((item) => {
                  const edit = draftById.get(item.id) ?? {
                    orderItemId: item.id,
                    included: true,
                    productId: item.productId,
                    quantity: item.quantity,
                  };
                  const replacementOptions = products.filter((product) =>
                    product.id === item.productId
                    || product.id === edit.productId
                    || (product.published !== false && product.stock > 0),
                  );
                  const selectedProduct = products.find((product) => product.id === edit.productId);
                  const price = lineUnitPrice(item, edit, products);
                  return (
                    <div
                      key={item.id}
                      className={edit.included
                        ? "admin-order-edit-line"
                        : "admin-order-edit-line is-omitted"}
                    >
                      <div className="admin-order-edit-line__top">
                        <div>
                          <strong>{item.productName}</strong>
                          <span>{item.sku}</span>
                        </div>
                        <button
                          type="button"
                          className={edit.included
                            ? "admin-line-toggle is-included"
                            : "admin-line-toggle is-omitted"}
                          onClick={() => updateDraft(item.id, { included: !edit.included })}
                        >
                          {edit.included ? "Include" : "Omit"}
                        </button>
                      </div>

                      <label>
                        <span>Swap item</span>
                        <select
                          value={edit.productId}
                          disabled={!edit.included}
                          onChange={(event) => updateDraft(item.id, {
                            productId: event.target.value,
                          })}
                        >
                          {replacementOptions.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name} · {product.priceQar} QAR · {product.stock} available
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="admin-order-edit-line__bottom">
                        <div className="admin-quantity-control" aria-label={`Quantity for ${item.productName}`}>
                          <button
                            type="button"
                            aria-label={`Decrease ${item.productName} quantity`}
                            disabled={!edit.included || edit.quantity <= 1}
                            onClick={() => updateDraft(item.id, {
                              quantity: Math.max(1, edit.quantity - 1),
                            })}
                          >
                            −
                          </button>
                          <span>{edit.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${item.productName} quantity`}
                            disabled={!edit.included}
                            onClick={() => updateDraft(item.id, {
                              quantity: Math.min(100, edit.quantity + 1),
                            })}
                          >
                            +
                          </button>
                        </div>
                        <div className="admin-order-edit-line__price">
                          {edit.productId !== item.productId && selectedProduct ? (
                            <span>Replacement price</span>
                          ) : (
                            <span>Order price</span>
                          )}
                          <strong>{price * edit.quantity} QAR</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="admin-order-editor__hint">
                Stock reserved at checkout is reconciled when this edited order is accepted.
                Omitted or reduced plants return to inventory; swaps and increases are stock-checked again.
              </p>

              <button
                type="button"
                className="primary-button"
                disabled={includedCount === 0 || acceptingEdited}
                onClick={() => onAcceptEdited(order.id, draft)}
              >
                {acceptingEdited ? "Accepting…" : `Accept included items · ${includedTotal} QAR`}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="admin-actions">
        {isPending ? (
          <>
            <button
              type="button"
              className="primary-button"
              onClick={() => onStatusChange(order.id, "CONFIRMED")}
            >
              {expanded ? (isArabic ? "قبول الطلب بالكامل" : "Accept full order") : t.accept}
            </button>
            <button
              type="button"
              className="primary-button primary-button--secondary"
              onClick={() => onStatusChange(order.id, "CANCELLED")}
            >
              {t.decline}
            </button>
          </>
        ) : null}

        {isAccepted ? (
          <>
            <button
              type="button"
              className="primary-button"
              onClick={() => onStatusChange(order.id, "DELIVERED")}
            >
              {t.complete}
            </button>
            <button
              type="button"
              className="primary-button primary-button--secondary"
              onClick={() => onStatusChange(order.id, "CANCELLED")}
            >
              {t.decline}
            </button>
          </>
        ) : null}

        {order.status === "CANCELLED" || order.status === "DELIVERED" ? (
          <button
            type="button"
            className="primary-button primary-button--danger"
            onClick={() => onDelete(order.id)}
          >
            {t.delete}
          </button>
        ) : null}

        {/* Same switch as the product's Published badge: Paid ⇄ Not paid. */}
        <button
          type="button"
          className={`admin-product-status-pill admin-product-status-pill--${isPaid ? "published" : "draft"}`}
          aria-pressed={isPaid}
          aria-label={`${t.payment} ${order.orderNumber}: ${isPaid ? t.paid : t.notPaid}`}
          title={isPaid ? t.markNotPaid : t.markPaid}
          onClick={() => onPaymentChange(order.id, isPaid ? "PENDING" : "PAID")}
        >
          {isPaid ? t.paid : t.notPaid}
        </button>

        <a
          href={`https://wa.me/${phone}?text=${whatsappMessage}`}
          target="_blank"
          rel="noreferrer"
          className="primary-button primary-button--secondary"
        >
          {t.notify}
        </a>

        {order.status !== "CANCELLED" ? (
          <Link to={`/admin/invoices/${order.id}`} className="primary-button primary-button--secondary">{t.invoice}</Link>
        ) : null}
      </div>
    </article>
  );
}

export function AdminOrdersPage() {
  const { content, isArabic } = useSiteLanguage();
  const t = isArabic ? { pending: "معلق", accepted: "مقبول", declined: "مرفوض", completed: "مكتمل", status: "حالة الطلب", loading: "جارٍ تحميل الطلبات…", loadError: "تعذر تحميل الطلبات.", deleteOrder: (number: string) => `هل تريد حذف الطلب ${number}؟ لا يمكن التراجع.` } : { pending: "Pending", accepted: "Accepted", declined: "Declined", completed: "Completed", status: "Order status", loading: "Loading orders…", loadError: "Could not load orders.", deleteOrder: (number: string) => `Delete order ${number}? This cannot be undone.` };
  const tabLabels: Record<(typeof tabs)[number]["status"], string> = { PENDING: t.pending, CONFIRMED: t.accepted, CANCELLED: t.declined, DELIVERED: t.completed };
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["status"]>("PENDING");
  const orders = useQuery({ queryKey: ["admin", "orders"], queryFn: adminApi.orders });
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: adminApi.products });

  function reconcileCommerceData() {
    queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "sales"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["product"] });
    queryClient.invalidateQueries({ queryKey: ["catalog-filters"] });
  }

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
    onSettled: reconcileCommerceData,
  });

  const acceptEdited = useMutation({
    mutationFn: ({ id, items }: { id: string; items: EditedOrderLine[] }) =>
      adminApi.acceptEditedOrder(id, items),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminOrder[]>(["admin", "orders"], (current = []) =>
        current.map((order) => order.id === updated.id ? updated : order),
      );
    },
    onSettled: reconcileCommerceData,
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
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "sales"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "sales"] });
    },
  });

  const filteredOrders = useMemo(
    () => orders.data?.filter((order) => tabForStatus(order.status) === activeTab) ?? [],
    [activeTab, orders.data],
  );

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
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "sales"] });
    },
  });

  function handleDelete(order: AdminOrder) {
    if (window.confirm(t.deleteOrder(order.orderNumber))) {
      deleteOrder.mutate(order.id);
    }
  }

  const canClearTab = activeTab === "CANCELLED" || activeTab === "DELIVERED";
  const activeLabel = tabLabels[activeTab];
  const mutationError =
    update.error
    ?? acceptEdited.error
    ?? updatePayment.error
    ?? deleteOrder.error
    ?? deleteVisibleOrders.error;

  return (
    <section className="page-shell admin-page" data-testid="admin-orders-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.orders}</p>
        <h1>{content.admin.orders}</h1>
      </div>

      {mutationError ? (
        <div className="admin-error-banner" role="alert">
          <span>{mutationError.message}</span>
          <button
            type="button"
            onClick={() => {
              update.reset();
              acceptEdited.reset();
              updatePayment.reset();
              deleteOrder.reset();
              deleteVisibleOrders.reset();
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="admin-order-toolbar">
        <OrderStatusTabs
          label={t.status}
          panelId="admin-order-panel"
          active={activeTab}
          onChange={setActiveTab}
          tabs={tabs.map((tab) => ({
            value: tab.status,
            label: tabLabels[tab.status],
            count: orders.data?.filter((order) => tabForStatus(order.status) === tab.status).length ?? 0,
            tone: TAB_TONES[tab.status],
          }))}
        />

        {canClearTab ? (
          <button
            type="button"
            className="primary-button primary-button--secondary admin-delete-all"
            disabled={!filteredOrders.length || deleteVisibleOrders.isPending}
            onClick={() => {
              if (window.confirm(`Clear all ${activeLabel.toLowerCase()} orders? This cannot be undone.`)) {
                deleteVisibleOrders.mutate();
              }
            }}
          >
            {deleteVisibleOrders.isPending ? "Clearing…" : `Clear ${activeLabel}`}
          </button>
        ) : null}
      </div>

      <div id="admin-order-panel" role="tabpanel" aria-labelledby={`admin-order-panel-tab-${activeTab}`} className="admin-order-panel">
      {orders.isPending ? <p className="admin-state" role="status">{t.loading}</p> : null}
      {orders.isError ? <p className="admin-state" role="alert">{t.loadError}</p> : null}
      {products.isError ? (
        <p role="alert">Replacement plants could not be loaded. Full-order actions are still available.</p>
      ) : null}


      <div className="admin-order-list">
        {filteredOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            products={products.data ?? []}
            onStatusChange={(id, status) => update.mutate({ id, status })}
            onPaymentChange={(id, paymentStatus) =>
              updatePayment.mutate({ id, paymentStatus })}
            onAcceptEdited={(id, items) => acceptEdited.mutate({ id, items })}
            acceptingEdited={
              acceptEdited.isPending && acceptEdited.variables?.id === order.id
            }
            onDelete={(id) => {
              const selected = orders.data?.find((item) => item.id === id);
              if (selected) handleDelete(selected);
            }}
          />
        ))}
      </div>
      </div>
    </section>
  );
}
