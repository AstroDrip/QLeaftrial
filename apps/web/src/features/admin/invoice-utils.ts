import type { AdminOrder } from "./admin-api";

export type PaymentFilter = "all" | "paid" | "unpaid";

// One invoice per order, numbered from the order number so it never needs a counter that could drift.
export function invoiceNumber(order: Pick<AdminOrder, "orderNumber">): string {
  return `INV-${order.orderNumber}`;
}

export function invoiceTotal(order: Pick<AdminOrder, "subtotalQar" | "deliveryFeeQar">): number {
  return order.subtotalQar + order.deliveryFeeQar;
}

// Cancelled (declined) orders were never fulfilled, so they get no invoice.
export function isInvoiceable(order: Pick<AdminOrder, "status">): boolean {
  return order.status !== "CANCELLED";
}

// The shop runs on Qatar time, so "today" and day boundaries follow Asia/Qatar, not the browser.
export function qatarDay(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const pick = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function filterInvoices(orders: AdminOrder[], filter: { from?: string; to?: string; payment: PaymentFilter }): AdminOrder[] {
  return orders
    .filter(isInvoiceable)
    .filter((order) => {
      const day = qatarDay(order.createdAt);
      if (filter.from && day < filter.from) return false;
      if (filter.to && day > filter.to) return false;
      if (filter.payment === "paid") return order.paymentStatus === "PAID";
      if (filter.payment === "unpaid") return order.paymentStatus !== "PAID";
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type InvoiceDay = { day: string; orders: AdminOrder[]; totalQar: number };

// Newest day first; input is already newest-first, so insertion order is preserved.
export function groupByDay(orders: AdminOrder[]): InvoiceDay[] {
  const days = new Map<string, InvoiceDay>();
  for (const order of orders) {
    const day = qatarDay(order.createdAt);
    const group = days.get(day) ?? { day, orders: [], totalQar: 0 };
    group.orders.push(order);
    group.totalQar += invoiceTotal(order);
    days.set(day, group);
  }
  return [...days.values()];
}

export function invoiceTotals(orders: AdminOrder[]): { count: number; totalQar: number; paidQar: number; unpaidQar: number } {
  let paidQar = 0;
  let unpaidQar = 0;
  for (const order of orders) {
    if (order.paymentStatus === "PAID") paidQar += invoiceTotal(order);
    else unpaidQar += invoiceTotal(order);
  }
  return { count: orders.length, totalQar: paidQar + unpaidQar, paidQar, unpaidQar };
}
