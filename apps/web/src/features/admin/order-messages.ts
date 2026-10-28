import type { AdminOrder, AdminOrderItem, EditedOrderLine, OrderChange } from "./admin-api";

type Language = "en" | "ar";

// What an unsaved edit of a pending order would change, worked out the same way the server records
// it when the edited order is accepted.
export function describeDraftChanges(
  items: AdminOrderItem[],
  draft: EditedOrderLine[],
  products: Array<{ id: string; name: string }>,
): OrderChange[] {
  const changes: OrderChange[] = [];
  for (const item of items) {
    const edit = draft.find((line) => line.orderItemId === item.id);
    if (!edit) continue;
    if (!edit.included) {
      changes.push({ type: "removed", name: item.productName, quantity: item.quantity });
    } else if (edit.productId !== item.productId) {
      const replacement = products.find((product) => product.id === edit.productId);
      changes.push({ type: "replaced", from: item.productName, to: replacement?.name ?? item.productName, quantity: edit.quantity });
    } else if (edit.quantity !== item.quantity) {
      changes.push({ type: "quantity", name: item.productName, from: item.quantity, to: edit.quantity });
    }
  }
  return changes;
}

export function changeLine(change: OrderChange, language: Language): string {
  if (language === "ar") {
    if (change.type === "removed") return `تمت إزالة: ${change.name} × ${change.quantity}`;
    if (change.type === "quantity") return `${change.name}: تغيّرت الكمية من ${change.from} إلى ${change.to}`;
    return `تم استبدال ${change.from} بـ ${change.to} × ${change.quantity}`;
  }
  if (change.type === "removed") return `Removed: ${change.name} × ${change.quantity}`;
  if (change.type === "quantity") return `${change.name}: quantity changed from ${change.from} to ${change.to}`;
  return `Replaced ${change.from} with ${change.to} × ${change.quantity}`;
}

// The customer opens this with the token the server signed for their order.
export function invoiceUrl(order: Pick<AdminOrder, "orderNumber" | "invoiceToken">, origin: string): string {
  return `${origin}/invoice/${encodeURIComponent(order.orderNumber)}?token=${encodeURIComponent(order.invoiceToken)}`;
}

type MessageInput = {
  order: AdminOrder;
  language: Language;
  origin: string;
  // For a pending order: the edits in the order editor that have not been accepted yet, and the total they give.
  pending?: { changes: OrderChange[]; total: number };
};

const copy = {
  en: {
    declined: (name: string, number: string) => `Hello ${name}, we're sorry, but order ${number} could not be fulfilled.`,
    received: (name: string, number: string, total: number) => `Hello ${name}, we have received your order ${number} (total ${total} QAR) and will confirm it shortly.`,
    updating: (name: string, number: string) => `Hello ${name}, regarding your order ${number}, we need to update it:`,
    newTotal: (total: number) => `New total: ${total} QAR`,
    confirmReply: "Please reply to let us know if this works for you.",
    changed: (number: string) => `Here is what changed in your order ${number}:`,
    thanks: [
      "Thank you for choosing us 🌿",
      "We truly appreciate your order and the trust you’ve placed in us. Every pot is prepared with care, love, and attention to detail.",
      "We hope you enjoy every breath! 🪴",
    ],
    support: "Thank you for supporting QLeaves 💚",
    invoice: "Your invoice:",
  },
  ar: {
    declined: (name: string, number: string) => `مرحبًا ${name}، نأسف لعدم تمكننا من تنفيذ الطلب ${number}.`,
    received: (name: string, number: string, total: number) => `مرحبًا ${name}، استلمنا طلبك ${number} (الإجمالي ${total} ر.ق) وسنؤكده قريبًا.`,
    updating: (name: string, number: string) => `مرحبًا ${name}، بخصوص طلبك ${number}، نحتاج إلى تعديله:`,
    newTotal: (total: number) => `الإجمالي الجديد: ${total} ر.ق`,
    confirmReply: "يرجى الرد لإعلامنا إن كان هذا مناسبًا لك.",
    changed: (number: string) => `هذه هي التغييرات التي أُجريت على طلبك ${number}:`,
    thanks: [
      "شكرًا لاختياركم لنا 🌿",
      "نقدّر طلبكم وثقتكم بنا من القلب. نُجهّز كل أصيص بعناية ومحبة واهتمام بالتفاصيل.",
      "نتمنى أن تستمتعوا بكل نَفَس! 🪴",
    ],
    support: "شكرًا لدعمكم QLeaves 💚",
    invoice: "فاتورتكم:",
  },
} as const;

export function whatsappText({ order, language, origin, pending }: MessageInput): string {
  const t = copy[language];
  const bullets = (changes: OrderChange[]) => changes.map((change) => `• ${changeLine(change, language)}`);

  if (order.status === "CANCELLED") return t.declined(order.customerName, order.orderNumber);

  if (order.status === "PENDING") {
    const total = pending?.total ?? order.subtotalQar + order.deliveryFeeQar;
    if (!pending?.changes.length) return t.received(order.customerName, order.orderNumber, total);
    return [t.updating(order.customerName, order.orderNumber), ...bullets(pending.changes), t.newTotal(total), "", t.confirmReply].join("\n");
  }

  const lines: string[] = [t.thanks[0], "", t.thanks[1], "", t.thanks[2], ""];
  if (order.editChanges.length) lines.push(t.changed(order.orderNumber), ...bullets(order.editChanges), t.newTotal(order.subtotalQar + order.deliveryFeeQar), "");
  lines.push(t.support, "", `${t.invoice} ${invoiceUrl(order, origin)}`);
  return lines.join("\n");
}
