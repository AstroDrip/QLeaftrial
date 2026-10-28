// The confirmation page has no public order lookup (order numbers would expose
// customer details), so checkout hands the summary over directly. Only item
// names and totals are kept; no contact or address details are stored.
export type OrderSummary = {
  orderNumber: string;
  items: Array<{ name: string; nameAr: string | null; quantity: number; unitPriceQar: number }>;
  subtotalQar: number;
};

const STORAGE_KEY = "qleaves-last-order";

function isOrderSummary(value: unknown): value is OrderSummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OrderSummary>;
  return typeof candidate.orderNumber === "string"
    && Array.isArray(candidate.items)
    && typeof candidate.subtotalQar === "number";
}

export function rememberOrderSummary(summary: OrderSummary): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(summary));
  } catch {
    // Storage can be unavailable (private mode); router state still carries the summary.
  }
}

export function recallOrderSummary(orderNumber: string | undefined, state: unknown): OrderSummary | null {
  const fromState = (state as { order?: unknown } | null)?.order;
  if (isOrderSummary(fromState) && fromState.orderNumber === orderNumber) return fromState;

  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (isOrderSummary(stored) && stored.orderNumber === orderNumber) return stored;
  } catch {
    return null;
  }
  return null;
}
