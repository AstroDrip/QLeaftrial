import { describe, expect, it } from "vitest";
import type { AdminOrder, EditedOrderLine } from "./admin-api";
import { changeLine, describeDraftChanges, invoiceUrl, whatsappText } from "./order-messages";

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: "o1", orderNumber: "QL-20261028-AAA111", customerName: "Aisha", phone: "+974 5555 1234", email: "a@example.com", addressLine1: "Villa 1", area: "Doha",
    paymentMethod: "COD", subtotalQar: 245, deliveryFeeQar: 0, status: "DELIVERED", paymentStatus: "PAID", createdAt: "2026-10-28T09:00:00Z",
    items: [
      { id: "l1", productId: "p1", productName: "Areca Palm", sku: "A", quantity: 3, unitPriceQar: 45 },
      { id: "l2", productId: "p2", productName: "Orchid", sku: "O", quantity: 1, unitPriceQar: 110 },
    ],
    editChanges: [], invoiceToken: "tok en/1", ...overrides,
  };
}
const products = [{ id: "p1", name: "Areca Palm" }, { id: "p2", name: "Orchid" }, { id: "p3", name: "Aloe Vera" }];
const origin = "https://qleaves.qa";

describe("customer WhatsApp messages", () => {
  it("thanks the customer and links their invoice once the order is accepted or completed", () => {
    for (const status of ["CONFIRMED", "DELIVERED"]) {
      const text = whatsappText({ order: order({ status }), language: "en", origin });
      expect(text).toContain("Thank you for choosing us");
      expect(text).toContain("Every pot is prepared with care, love, and attention to detail.");
      expect(text).toContain("We hope you enjoy every breath!");
      expect(text).toContain("Thank you for supporting QLeaves");
      expect(text.endsWith("Your invoice: https://qleaves.qa/invoice/QL-20261028-AAA111?token=tok%20en%2F1")).toBe(true);
      expect(text).not.toContain("changed");
    }
  });

  it("lists what the shop changed in an accepted edited order, with the new total", () => {
    const text = whatsappText({
      order: order({ status: "CONFIRMED", editChanges: [{ type: "quantity", name: "Areca Palm", from: 3, to: 2 }, { type: "removed", name: "Orchid", quantity: 1 }, { type: "replaced", from: "Fern", to: "Aloe Vera", quantity: 2 }] }),
      language: "en", origin,
    });
    expect(text).toContain("• Areca Palm: quantity changed from 3 to 2");
    expect(text).toContain("• Removed: Orchid × 1");
    expect(text).toContain("• Replaced Fern with Aloe Vera × 2");
    expect(text).toContain("New total: 245 QAR");
    expect(text.indexOf("New total")).toBeLessThan(text.indexOf("Your invoice"));
  });

  it("describes the edits in the pending editor and asks the customer to confirm", () => {
    const draft: EditedOrderLine[] = [
      { orderItemId: "l1", included: true, productId: "p1", quantity: 2 },
      { orderItemId: "l2", included: false, productId: "p2", quantity: 1 },
    ];
    const pendingOrder = order({ status: "PENDING", paymentStatus: "PENDING" });
    const changes = describeDraftChanges(pendingOrder.items, draft, products);
    expect(changes).toEqual([{ type: "quantity", name: "Areca Palm", from: 3, to: 2 }, { type: "removed", name: "Orchid", quantity: 1 }]);

    const text = whatsappText({ order: pendingOrder, language: "en", origin, pending: { changes, total: 90 } });
    expect(text).toContain("we need to update it");
    expect(text).toContain("• Areca Palm: quantity changed from 3 to 2");
    expect(text).toContain("New total: 90 QAR");
    expect(text).toContain("Please reply");
    expect(text).not.toContain("Your invoice");
  });

  it("spots a swapped plant and ignores lines that did not change", () => {
    const draft: EditedOrderLine[] = [
      { orderItemId: "l1", included: true, productId: "p1", quantity: 3 },
      { orderItemId: "l2", included: true, productId: "p3", quantity: 1 },
    ];
    expect(describeDraftChanges(order().items, draft, products)).toEqual([{ type: "replaced", from: "Orchid", to: "Aloe Vera", quantity: 1 }]);
  });

  it("confirms receipt of an unchanged pending order and apologises for a declined one", () => {
    expect(whatsappText({ order: order({ status: "PENDING" }), language: "en", origin, pending: { changes: [], total: 245 } })).toContain("we have received your order QL-20261028-AAA111 (total 245 QAR)");
    expect(whatsappText({ order: order({ status: "CANCELLED" }), language: "en", origin })).toContain("could not be fulfilled");
  });

  it("is available in Arabic with the same details", () => {
    const text = whatsappText({ order: order({ status: "DELIVERED", editChanges: [{ type: "removed", name: "Orchid", quantity: 1 }] }), language: "ar", origin });
    expect(text).toContain("شكرًا لاختياركم لنا");
    expect(text).toContain("تمت إزالة: Orchid × 1");
    expect(text).toContain("الإجمالي الجديد: 245 ر.ق");
    expect(text).toContain("فاتورتكم: https://qleaves.qa/invoice/");
    expect(changeLine({ type: "quantity", name: "Fern", from: 1, to: 2 }, "ar")).toBe("Fern: تغيّرت الكمية من 1 إلى 2");
  });

  it("builds an invoice link that is safe to paste into a URL", () => {
    expect(invoiceUrl({ orderNumber: "QL-1", invoiceToken: "a b" }, origin)).toBe("https://qleaves.qa/invoice/QL-1?token=a%20b");
  });
});
