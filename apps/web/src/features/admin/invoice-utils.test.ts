import { describe, expect, it } from "vitest";
import type { AdminOrder } from "./admin-api";
import { filterInvoices, groupByDay, invoiceNumber, invoiceTotal, invoiceTotals, isInvoiceable, qatarDay } from "./invoice-utils";

function order(overrides: Partial<AdminOrder>): AdminOrder {
  return {
    id: "o1", orderNumber: "QL-20261028-AAA111", customerName: "Aisha", phone: "+974 5555 1234", email: "a@example.com",
    addressLine1: "Villa 1", area: "Doha", paymentMethod: "COD", subtotalQar: 100, deliveryFeeQar: 20,
    status: "DELIVERED", paymentStatus: "PAID", createdAt: "2026-10-28T09:00:00Z", items: [], ...overrides,
  };
}

describe("invoice utilities", () => {
  it("derives the invoice number and total from the order", () => {
    expect(invoiceNumber(order({}))).toBe("INV-QL-20261028-AAA111");
    expect(invoiceTotal(order({ subtotalQar: 245, deliveryFeeQar: 25 }))).toBe(270);
  });

  it("does not invoice declined orders", () => {
    expect(isInvoiceable(order({ status: "CANCELLED" }))).toBe(false);
    for (const status of ["PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED"]) expect(isInvoiceable(order({ status }))).toBe(true);
  });

  it("uses the Qatar calendar day, even when UTC is still the previous day", () => {
    // 22:30 UTC on the 27th is 01:30 on the 28th in Qatar (UTC+3).
    expect(qatarDay("2026-10-27T22:30:00Z")).toBe("2026-10-28");
    expect(qatarDay("2026-10-28T20:59:00Z")).toBe("2026-10-28");
    expect(qatarDay("2026-10-28T21:00:00Z")).toBe("2026-10-29");
  });

  it("filters by Qatar date range and payment, newest first, skipping declined orders", () => {
    const orders = [
      order({ id: "a", createdAt: "2026-10-26T10:00:00Z", paymentStatus: "PAID" }),
      order({ id: "b", createdAt: "2026-10-27T22:30:00Z", paymentStatus: "PENDING" }),
      order({ id: "c", createdAt: "2026-10-28T10:00:00Z", paymentStatus: "PAID" }),
      order({ id: "d", createdAt: "2026-10-28T11:00:00Z", status: "CANCELLED" }),
    ];

    expect(filterInvoices(orders, { payment: "all" }).map((o) => o.id)).toEqual(["c", "b", "a"]);
    expect(filterInvoices(orders, { from: "2026-10-28", payment: "all" }).map((o) => o.id)).toEqual(["c", "b"]);
    expect(filterInvoices(orders, { to: "2026-10-27", payment: "all" }).map((o) => o.id)).toEqual(["a"]);
    expect(filterInvoices(orders, { payment: "paid" }).map((o) => o.id)).toEqual(["c", "a"]);
    expect(filterInvoices(orders, { payment: "unpaid" }).map((o) => o.id)).toEqual(["b"]);
  });

  it("groups by day with per-day totals and sums paid versus unpaid", () => {
    const orders = [
      order({ id: "c", createdAt: "2026-10-28T10:00:00Z", subtotalQar: 100, deliveryFeeQar: 20, paymentStatus: "PAID" }),
      order({ id: "b", createdAt: "2026-10-28T08:00:00Z", subtotalQar: 50, deliveryFeeQar: 20, paymentStatus: "PENDING" }),
      order({ id: "a", createdAt: "2026-10-26T10:00:00Z", subtotalQar: 80, deliveryFeeQar: 20, paymentStatus: "FAILED" }),
    ];

    expect(groupByDay(orders).map((group) => [group.day, group.orders.length, group.totalQar])).toEqual([["2026-10-28", 2, 190], ["2026-10-26", 1, 100]]);
    expect(invoiceTotals(orders)).toEqual({ count: 3, totalQar: 290, paidQar: 120, unpaidQar: 170 });
  });
});
