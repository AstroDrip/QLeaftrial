import { invoiceToken } from "./invoice-link.js";
import { parseOrderChanges } from "./order-changes.js";
import { municipalityAt } from "../../lib/geo/qatar.js";

// The shape the admin screens receive: the stored change summary is parsed, and each order carries the
// token that unlocks its customer-facing invoice link.
export function toAdminOrder<T extends { id: string; editSummary?: string | null; deliveryLocation?: { latitude: number; longitude: number } | null }>(order: T) {
  const { editSummary, ...rest } = order;
  const location = order.deliveryLocation;
  return {
    ...rest,
    editChanges: parseOrderChanges(editSummary),
    invoiceToken: invoiceToken(order.id),
    // Which municipality the pin is in, and whether QLeaves delivers there (for the admin's location card).
    ...(location ? { deliveryMunicipality: municipalityAt(location.latitude, location.longitude) } : {}),
  };
}
