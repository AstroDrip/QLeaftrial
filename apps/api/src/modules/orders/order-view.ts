import { invoiceToken } from "./invoice-link.js";
import { parseOrderChanges } from "./order-changes.js";
import { municipalityAt, reverseGeocode } from "../../lib/geo/qatar.js";

// The shape the admin screens receive: the stored change summary is parsed, and each order carries the
// token that unlocks its customer-facing invoice link.
type StoredLocation = { latitude: number; longitude: number; area?: string | null; street?: string | null; landmark?: string | null };

// Which address parts match what the map knows for the pin ("map") and which are the customer's own words
// ("customer"). Zone, building and flat are never on the map, so they are always the customer's.
function fieldSources(location: StoredLocation) {
  const en = reverseGeocode(location.latitude, location.longitude, "en");
  const ar = reverseGeocode(location.latitude, location.longitude, "ar");
  const source = (value: string | null | undefined, ...known: Array<string | null>) =>
    !value ? null : known.some((name) => name && name.trim().toLowerCase() === value.trim().toLowerCase()) ? "map" : "customer";
  return {
    area: source(location.area, en.area, ar.area),
    street: source(location.street, en.street, ar.street),
    landmark: source(location.landmark, en.landmark, ar.landmark),
  };
}

export function toAdminOrder<T extends { id: string; editSummary?: string | null; deliveryLocation?: StoredLocation | null }>(order: T) {
  const { editSummary, ...rest } = order;
  const location = order.deliveryLocation;
  return {
    ...rest,
    editChanges: parseOrderChanges(editSummary),
    invoiceToken: invoiceToken(order.id),
    // Which municipality the pin is in, and whether QLeaves delivers there (for the admin's location card).
    ...(location ? { deliveryMunicipality: municipalityAt(location.latitude, location.longitude), deliveryFieldSources: fieldSources(location) } : {}),
  };
}

type StoredOrder = {
  id: string; orderNumber: string; status: string; paymentMethod: string; paymentStatus: string; area: string;
  subtotalQar: number; deliveryFeeQar: number; deliveryChargePending: boolean; createdAt: Date;
  items: Array<{ productId: string; productName: string; quantity: number; unitPriceQar: number }>;
};

// What the customer's browser receives after placing an order: enough for the confirmation page and nothing else.
// Listed field by field on purpose, so a column added to the database later is never sent out by accident.
export function toPublicOrder(order: StoredOrder) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    area: order.area,
    subtotalQar: order.subtotalQar,
    deliveryFeeQar: order.deliveryFeeQar,
    deliveryChargePending: order.deliveryChargePending,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPriceQar: item.unitPriceQar,
    })),
  };
}
