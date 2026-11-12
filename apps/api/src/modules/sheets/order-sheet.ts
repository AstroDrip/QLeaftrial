import { getAccessToken, normalizePrivateKey, SheetsError, type ServiceAccount } from "./google-auth.js";
import { prisma } from "../../lib/prisma.js";
import { FREE_DELIVERY_THRESHOLD_QAR } from "../../lib/delivery.js";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const REQUEST_TIMEOUT_MS = 8_000;
// Orders are saved before the sheet is touched; this only bounds how long a customer waits for the response.
const MIRROR_BUDGET_MS = 6_000;
const DEFAULT_TAB = "Orders";

export const SHEET_HEADER = [
  "Order no.", "Invoice no.", "Date (Qatar)", "Customer", "Phone", "Area", "Address", "Items",
  "Subtotal (QAR)", "Total (QAR)", "Payment method", "Payment status", "Order status", "Delivery notes", "Updated (Qatar)",
  // Added November 2026, at the end so rows written before keep their columns.
  "Delivery (QAR)", "Delivery charge",
];
const LAST_COLUMN = "Q";

export type SheetOrder = {
  id?: string;
  orderNumber: string;
  createdAt: Date | string;
  customerName: string;
  phone: string;
  area: string;
  addressLine1: string;
  deliveryNotes?: string | null;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  subtotalQar: number;
  deliveryFeeQar: number;
  deliveryChargePending?: boolean;
  deliveryFeeConfirmedAt?: Date | string | null;
  items: Array<{ productName: string; quantity: number }>;
};

// Whether the delivery charge in the row is final. Orders from before the rule simply say "Not recorded".
export function deliveryChargeLabel(order: Pick<SheetOrder, "subtotalQar" | "deliveryChargePending" | "deliveryFeeConfirmedAt">): string {
  if (order.deliveryChargePending) return "To confirm";
  if (order.deliveryFeeConfirmedAt) return "Confirmed";
  return order.subtotalQar >= FREE_DELIVERY_THRESHOLD_QAR ? "Free" : "Not recorded";
}

// The sheet is the books for finished sales: an order is written once it is completed and paid.
export function qualifiesForSheet(order: Pick<SheetOrder, "status" | "paymentStatus">): boolean {
  return order.status === "DELIVERED" && order.paymentStatus === "PAID";
}

export type SheetsConfig = { spreadsheetId: string; tab: string; account: ServiceAccount };

export function sheetsConfig(env: NodeJS.ProcessEnv = process.env): SheetsConfig | null {
  const spreadsheetId = env.GOOGLE_SHEETS_ID?.trim();
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = env.GOOGLE_PRIVATE_KEY;
  if (!spreadsheetId || !email || !key?.trim()) return null;
  return { spreadsheetId, tab: env.GOOGLE_SHEETS_TAB?.trim() || DEFAULT_TAB, account: { email, privateKey: normalizePrivateKey(key) } };
}

export function sheetUrl(config: SheetsConfig): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(config.spreadsheetId)}`;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending", CONFIRMED: "Accepted", PREPARING: "Preparing", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Completed", CANCELLED: "Declined",
};
const PAYMENT_LABELS: Record<string, string> = { PAID: "Paid", PENDING: "Pending", FAILED: "Failed" };
const METHOD_LABELS: Record<string, string> = { COD: "Cash on delivery", PAYMENT_LINK: "Payment link" };

function qatarDateTime(value: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}`;
}

// Email is deliberately left out: the sheet is an operations record, not a customer database.
export function orderToRow(order: SheetOrder, now: Date = new Date()): Array<string | number> {
  return [
    order.orderNumber,
    `INV-${order.orderNumber}`,
    qatarDateTime(order.createdAt),
    order.customerName,
    order.phone,
    order.area,
    order.addressLine1,
    order.items.map((item) => `${item.productName} × ${item.quantity}`).join("; "),
    order.subtotalQar,
    order.subtotalQar + order.deliveryFeeQar,
    METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod,
    PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus,
    STATUS_LABELS[order.status] ?? order.status,
    order.deliveryNotes ?? "",
    qatarDateTime(now),
    order.deliveryFeeQar,
    deliveryChargeLabel(order),
  ];
}

const quoted = (tab: string) => `'${tab.replace(/'/g, "''")}'`;
const range = (config: SheetsConfig, cells: string) => encodeURIComponent(`${quoted(config.tab)}!${cells}`);

async function call<T>(config: SheetsConfig, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await getAccessToken(config.account);
  const response = await fetch(`${API}/${encodeURIComponent(config.spreadsheetId)}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new SheetsError("SHEETS_REQUEST_FAILED", response.status);
  return response.json() as Promise<T>;
}

const prepared = new Map<string, Promise<void>>();

// Creates the tab and header row once per server instance; a failure is retried on the next call.
async function ensureSheet(config: SheetsConfig): Promise<void> {
  const key = `${config.spreadsheetId}:${config.tab}`;
  let pending = prepared.get(key);
  if (!pending) {
    pending = (async () => {
      const meta = await call<{ sheets?: Array<{ properties?: { title?: string } }> }>(config, "?fields=sheets.properties.title");
      if (!meta.sheets?.some((sheet) => sheet.properties?.title === config.tab)) {
        await call(config, ":batchUpdate", { method: "POST", body: { requests: [{ addSheet: { properties: { title: config.tab } } }] } });
      }
      const first = await call<{ values?: string[][] }>(config, `/values/${range(config, `A1:${LAST_COLUMN}1`)}`);
      // Also rewrites an older, shorter header so the new columns get their titles.
      if ((first.values?.[0] ?? []).join("|") !== SHEET_HEADER.join("|")) {
        await call(config, `/values/${range(config, `A1:${LAST_COLUMN}1`)}?valueInputOption=RAW`, { method: "PUT", body: { values: [SHEET_HEADER] } });
      }
    })();
    prepared.set(key, pending);
    pending.catch(() => prepared.delete(key));
  }
  return pending;
}

async function orderNumberColumn(config: SheetsConfig): Promise<string[]> {
  const column = await call<{ values?: string[][] }>(config, `/values/${range(config, "A:A")}`);
  return (column.values ?? []).map((row) => row[0] ?? "");
}

// Writes or updates one order's row and says whether the sheet was written. The order number (column A) is the
// row's key, so a retry updates the same row instead of adding a second one.
export async function syncOrder(order: SheetOrder, config: SheetsConfig): Promise<boolean> {
  const qualifies = qualifiesForSheet(order);
  // A completed order that has since been marked unpaid is only corrected if it is already in the sheet.
  if (!qualifies && order.status !== "DELIVERED") return false;
  await ensureSheet(config);
  const index = (await orderNumberColumn(config)).indexOf(order.orderNumber);
  if (index < 0 && !qualifies) return false;
  const row = orderToRow(order);
  if (index >= 0) {
    const line = index + 1;
    await call(config, `/values/${range(config, `A${line}:${LAST_COLUMN}${line}`)}?valueInputOption=RAW`, { method: "PUT", body: { values: [row] } });
  } else {
    await call(config, `/values/${range(config, `A:${LAST_COLUMN}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: { values: [row] } });
  }
  return true;
}

// Remembers on the order whether its row is in the sheet, so admin can see failures and retry them. Best effort:
// recording never turns a sync result into an error.
export async function recordSheetSync(orderIds: string[], outcome: { ok: true } | { ok: false; code: string }): Promise<void> {
  if (orderIds.length === 0) return;
  try {
    await (prisma.order as unknown as { updateMany(args: unknown): Promise<unknown> }).updateMany({
      where: { id: { in: orderIds } },
      data: outcome.ok ? { sheetSyncedAt: new Date(), sheetSyncError: null } : { sheetSyncError: outcome.code },
    });
  } catch {
    // The order may have been deleted meanwhile; nothing to record.
  }
}

// Updates rows that exist and appends completed, paid orders that are missing. It never deletes, so
// orders removed from the shop admin stay in the sheet as a record. Returns how many orders it wrote.
export async function syncAllOrders(orders: SheetOrder[], config: SheetsConfig): Promise<number> {
  await ensureSheet(config);
  const existing = await orderNumberColumn(config);
  const updates: Array<{ range: string; values: Array<Array<string | number>> }> = [];
  const additions: Array<Array<string | number>> = [];
  for (const order of orders) {
    const index = existing.indexOf(order.orderNumber);
    if (index >= 0) updates.push({ range: `${quoted(config.tab)}!A${index + 1}:${LAST_COLUMN}${index + 1}`, values: [orderToRow(order)] });
    else if (qualifiesForSheet(order)) additions.push(orderToRow(order));
  }
  if (updates.length) await call(config, "/values:batchUpdate", { method: "POST", body: { valueInputOption: "RAW", data: updates } });
  if (additions.length) await call(config, `/values/${range(config, `A:${LAST_COLUMN}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: { values: additions } });
  const written = orders.filter((order) => existing.includes(order.orderNumber) || qualifiesForSheet(order)).flatMap((order) => (order.id ? [order.id] : []));
  await recordSheetSync(written, { ok: true });
  return updates.length + additions.length;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SheetsError("SHEETS_TIMEOUT")), ms); });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

// Called after an order has been saved. The shop must never fail because Google is slow or down,
// so this swallows every error; "Sync all" in admin brings the sheet back in line.
export async function mirrorOrderToSheet(order: SheetOrder): Promise<void> {
  const config = sheetsConfig();
  if (!config) return;
  try {
    const written = await withTimeout(syncOrder(order, config), MIRROR_BUDGET_MS);
    if (written && order.id) await recordSheetSync([order.id], { ok: true });
  } catch (error) {
    const reason = error instanceof SheetsError ? error.message : error instanceof Error ? error.name : "unknown";
    console.error(JSON.stringify({ level: "error", event: "sheet-sync-failed", reason }));
    // Only orders that belong in the sheet are marked as failed (the others were never meant to be written).
    if (order.id && (qualifiesForSheet(order) || order.status === "DELIVERED")) {
      await recordSheetSync([order.id], { ok: false, code: error instanceof SheetsError ? error.code : "SHEETS_SYNC_FAILED" });
    }
  }
}

export function resetSheetPreparation(): void {
  prepared.clear();
}
