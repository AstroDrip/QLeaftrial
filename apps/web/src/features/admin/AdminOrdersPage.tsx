import { useEffect, useMemo, useState } from "react";
import { content } from "../../content/en";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  type AdminOrder,
  type AdminOrderItem,
  type AdminProduct,
  type EditedOrderLine,
} from "./admin-api";

const tabs = [
  { status: "PENDING", label: "Pending", shortLabel: "P" },
  { status: "CONFIRMED", label: "Accepted", shortLabel: "A" },
  { status: "CANCELLED", label: "Declined", shortLabel: "D" },
  { status: "DELIVERED", label: "Completed", shortLabel: "C" },
] as const;

function formatQatarDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
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
  const isPending = order.status === "PENDING";
  const isAccepted = order.status === "CONFIRMED";
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
  const whatsappCopy = order.status === "CANCELLED"
    ? `Hello ${order.customerName}, we're sorry, but order ${order.orderNumber} could not be fulfilled.`
    : order.status === "DELIVERED"
      ? `Hello ${order.customerName}, thank you. Order ${order.orderNumber} has been completed.`
      : order.status === "CONFIRMED"
        ? `Hello ${order.customerName}, order ${order.orderNumber} has been accepted.`
        : `Hello ${order.customerName}, regarding order ${order.orderNumber}.`;
  const whatsappMessage = encodeURIComponent(whatsappCopy);

  function updateDraft(orderItemId: string, patch: Partial<EditedOrderLine>) {
    setDraft((current) => current.map((line) =>
      line.orderItemId === orderItemId ? { ...line, ...patch } : line,
    ));
  }

  return (
    <article className="metric-card admin-order-card" data-testid={`order-${order.orderNumber}`}>
      <div className="admin-order-card__header">
        <div>
          <p className="eyebrow">{order.orderNumber}</p>
          <h2>{order.customerName}</h2>
          <p>{order.phone}</p>
          <p>{order.email}</p>
        </div>
        <strong>{order.subtotalQar + order.deliveryFeeQar} QAR</strong>
      </div>

      <div className="admin-order-meta">
        <span>Items: {order.subtotalQar} QAR</span>
        <span>Delivery: {order.deliveryFeeQar} QAR</span>
        <span>Ordered {formatQatarDateTime(order.createdAt)}</span>
        <span>{paymentMethodLabel(order.paymentMethod)}</span>
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
            <span aria-hidden="true" className={expanded ? "admin-order-expand__icon is-open" : "admin-order-expand__icon"}>⌄</span>
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
              {expanded ? "Accept full order" : "Accept"}
            </button>
            <button
              type="button"
              className="primary-button primary-button--secondary"
              onClick={() => onStatusChange(order.id, "CANCELLED")}
            >
              Decline
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
              Complete
            </button>
            <button
              type="button"
              className="primary-button primary-button--secondary"
              onClick={() => onStatusChange(order.id, "CANCELLED")}
            >
              Decline
            </button>
          </>
        ) : null}

        {order.status === "CANCELLED" || order.status === "DELIVERED" ? (
          <button
            type="button"
            className="primary-button primary-button--danger"
            onClick={() => onDelete(order.id)}
          >
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
    () => orders.data?.filter((order) => order.status === activeTab) ?? [],
    [activeTab, orders.data],
  );

  const deleteVisibleOrders = useMutation({
    mutationFn: async () => {
      const visibleOrderIds = filteredOrders.map((order) => order.id);
      await adminApi.deleteOrders(visibleOrderIds);
    },
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
    if (window.confirm(`Delete order ${order.orderNumber}? This cannot be undone.`)) {
      deleteOrder.mutate(order.id);
    }
  }

  const canClearTab = activeTab === "CANCELLED" || activeTab === "DELIVERED";
  const activeLabel = tabs.find((tab) => tab.status === activeTab)?.label ?? "orders";
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
        <div className="admin-order-tabs" role="tablist" aria-label="Order status">
          {tabs.map((tab) => {
            const count = orders.data?.filter((order) => order.status === tab.status).length ?? 0;
            const active = activeTab === tab.status;
            return (
              <button
                key={tab.status}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? "primary-button" : "primary-button primary-button--secondary"}
                onClick={() => setActiveTab(tab.status)}
              >
                <span className="admin-order-tab__full">{tab.label}</span>
                <span className="admin-order-tab__short" aria-hidden="true">{tab.shortLabel}</span>
                <span className="admin-order-tab__count">{count}</span>
              </button>
            );
          })}
        </div>

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

      {orders.isPending ? <p>Loading orders…</p> : null}
      {orders.isError ? <p role="alert">Could not load orders.</p> : null}
      {products.isError ? (
        <p role="alert">Replacement plants could not be loaded. Full-order actions are still available.</p>
      ) : null}

      {!orders.isPending && filteredOrders.length === 0 ? (
        <div className="table-card">
          <p>No {activeLabel.toLowerCase()} orders right now.</p>
        </div>
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
    </section>
  );
}
