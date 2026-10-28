import { invoiceToken } from "./invoice-link.js";
import { parseOrderChanges } from "./order-changes.js";

// The shape the admin screens receive: the stored change summary is parsed, and each order carries the
// token that unlocks its customer-facing invoice link.
export function toAdminOrder<T extends { id: string; editSummary?: string | null }>(order: T) {
  const { editSummary, ...rest } = order;
  return { ...rest, editChanges: parseOrderChanges(editSummary), invoiceToken: invoiceToken(order.id) };
}
