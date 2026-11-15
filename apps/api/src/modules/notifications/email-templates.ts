import { municipalityAt } from "../../lib/geo/qatar.js";

// The admin's order emails. Plain tables and inline styles only, so Gmail and phone mail apps render them the same.
// Customer-written values (names, addresses) may be Arabic or English: each is wrapped with dir="auto" so it reads
// in its own direction. Nothing here carries card data, tokens or internal keys.
export type NotificationEvent = "ORDER_CREATED" | "PAYMENT_VERIFIED" | "PAYMENT_FAILED" | "ORDER_CANCELLED";

export type EmailOrder = {
  id: string; orderNumber: string; createdAt: Date; customerName: string; phone: string; email: string;
  addressLine1: string; area: string; deliveryNotes?: string | null; paymentMethod: string; paymentStatus: string;
  subtotalQar: number; deliveryFeeQar: number; deliveryChargePending: boolean; deliveryLocationManual?: boolean;
  items: Array<{ productName: string; quantity: number; unitPriceQar: number }>;
  deliveryLocation?: {
    latitude: number; longitude: number; formattedAddress: string; area?: string | null; zone?: string | null;
    street?: string | null; building?: string | null; unit?: string | null; landmark?: string | null;
  } | null;
};

const HEADLINE: Record<NotificationEvent, string> = {
  ORDER_CREATED: "New order received",
  PAYMENT_VERIFIED: "Payment received",
  PAYMENT_FAILED: "Payment failed",
  ORDER_CANCELLED: "Order declined",
};
const PAYMENT_METHOD: Record<string, string> = { COD: "Cash on delivery", PAYMENT_LINK: "Payment link", CARD: "Card (online)" };
const PAYMENT_STATUS: Record<string, string> = { PENDING: "Not paid yet", PAID: "Paid", FAILED: "Failed" };
const MISSING = "Not provided";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function qatarDateTime(date: Date): string {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
  return `${text} (Qatar time)`;
}

function siteUrl(): string {
  return (process.env.PUBLIC_SITE_URL?.trim() || "https://qleaves.qa").replace(/\/+$/, "");
}

/** The address parts, each either its value or null when the customer and the map gave nothing. */
function addressRows(order: EmailOrder): Array<[string, string | null]> {
  const location = order.deliveryLocation;
  const municipality = location ? municipalityAt(location.latitude, location.longitude)?.label ?? null : null;
  const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null);
  return [
    ["Delivery address", text(order.addressLine1)],
    ["Municipality", municipality ?? text(order.area)],
    ["Area", text(location?.area)],
    ["Zone", text(location?.zone)],
    ["Street", text(location?.street)],
    ["Building", text(location?.building)],
    ["Flat / floor", text(location?.unit)],
    ["Landmark", text(location?.landmark)],
  ];
}

export function renderOrderEmail(order: EmailOrder, event: NotificationEvent): { subject: string; html: string; text: string } {
  const headline = HEADLINE[event];
  const total = order.subtotalQar + order.deliveryFeeQar;
  const delivery = order.deliveryChargePending
    ? "To be confirmed with the customer"
    : order.deliveryFeeQar === 0 ? "Free" : `QAR ${order.deliveryFeeQar}`;
  const totalLabel = order.deliveryChargePending ? "Total so far (delivery charge not yet added)" : "Order total";
  const adminLink = `${siteUrl()}/admin/orders?order=${encodeURIComponent(order.orderNumber)}`;
  const location = order.deliveryLocation;
  const mapNote = location
    ? `Pin confirmed on the map (${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)})`
    : order.deliveryLocationManual ? "Written address only: the customer could not use the map" : "No map location recorded";
  const customer: Array<[string, string | null]> = [
    ["Customer", order.customerName], ["Phone", order.phone], ["Email", order.email || null],
  ];
  const payment: Array<[string, string]> = [
    ["Payment method", PAYMENT_METHOD[order.paymentMethod] ?? order.paymentMethod],
    ["Payment status", PAYMENT_STATUS[order.paymentStatus] ?? order.paymentStatus],
  ];
  const address = addressRows(order);

  const cell = "padding:8px 0;border-bottom:1px solid #e6eadf;font-size:14px;line-height:1.45;vertical-align:top;";
  const row = (label: string, value: string | null) =>
    `<tr><td style="${cell}color:#5d6b5f;width:38%;">${escapeHtml(label)}</td><td style="${cell}color:${value ? "#16261b" : "#a4532c"};" dir="auto">${value ? escapeHtml(value) : `<em>${MISSING}</em>`}</td></tr>`;
  const section = (title: string, rows: string) =>
    `<h2 style="margin:24px 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#3f870b;">${escapeHtml(title)}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>`;
  const itemRows = order.items.map((item) =>
    `<tr><td style="${cell}color:#16261b;" dir="auto">${escapeHtml(item.productName)}</td><td style="${cell}color:#16261b;text-align:center;white-space:nowrap;">${item.quantity} × QAR ${item.unitPriceQar}</td><td style="${cell}color:#16261b;text-align:right;white-space:nowrap;">QAR ${item.quantity * item.unitPriceQar}</td></tr>`).join("");
  const moneyRow = (label: string, value: string, strong = false) =>
    `<tr><td colspan="2" style="${cell}color:#5d6b5f;${strong ? "font-weight:700;color:#16261b;" : ""}">${escapeHtml(label)}</td><td style="${cell}text-align:right;white-space:nowrap;color:#16261b;${strong ? "font-weight:700;" : ""}">${escapeHtml(value)}</td></tr>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(headline)} ${escapeHtml(order.orderNumber)}</title></head>
<body style="margin:0;padding:0;background:#f3f5ee;font-family:Arial,'Segoe UI',Tahoma,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5ee;"><tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#1b2a1f;padding:20px 24px;color:#f6f1d6;">
<div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">QLeaves</div>
<div style="font-size:22px;font-weight:700;margin-top:4px;">${escapeHtml(headline)}</div>
<div style="font-size:15px;margin-top:6px;">Order <strong>${escapeHtml(order.orderNumber)}</strong> · ${escapeHtml(qatarDateTime(order.createdAt))}</div>
</td></tr>
<tr><td style="padding:8px 24px 24px;">
${section("Customer", customer.map(([label, value]) => row(label, value)).join(""))}
${section("Items", `${itemRows}${moneyRow("Merchandise subtotal", `QAR ${order.subtotalQar}`)}${moneyRow("Delivery charge", delivery)}${moneyRow(totalLabel, `QAR ${total}`, true)}`)}
${section("Payment", payment.map(([label, value]) => row(label, value)).join(""))}
${section("Delivery", `${address.map(([label, value]) => row(label, value)).join("")}${row("Map", mapNote)}${row("Delivery notes", order.deliveryNotes?.trim() || null)}`)}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td style="background:#3f870b;border-radius:8px;"><a href="${escapeHtml(adminLink)}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Open this order in admin</a></td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#7b867c;line-height:1.5;">This message was sent automatically by the QLeaves website. Fields marked “${MISSING}” were left empty by the customer.</p>
</td></tr></table></td></tr></table></body></html>`;

  const line = (label: string, value: string | null) => `${label}: ${value ?? MISSING}`;
  const text = [
    `${headline} - ${order.orderNumber}`,
    qatarDateTime(order.createdAt),
    "",
    ...customer.map(([label, value]) => line(label, value)),
    "",
    ...order.items.map((item) => `${item.quantity} x ${item.productName} @ QAR ${item.unitPriceQar} = QAR ${item.quantity * item.unitPriceQar}`),
    line("Merchandise subtotal", `QAR ${order.subtotalQar}`),
    line("Delivery charge", delivery),
    line(totalLabel, `QAR ${total}`),
    "",
    ...payment.map(([label, value]) => line(label, value)),
    "",
    ...address.map(([label, value]) => line(label, value)),
    line("Map", mapNote),
    line("Delivery notes", order.deliveryNotes?.trim() || null),
    "",
    `Open in admin: ${adminLink}`,
  ].join("\n");

  return { subject: `${headline}: ${order.orderNumber} (QAR ${total}${order.deliveryChargePending ? " + delivery" : ""})`, html, text };
}
