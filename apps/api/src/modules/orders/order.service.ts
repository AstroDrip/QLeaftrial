import { createHash, randomInt } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import { getStoreSettings } from "../admin/store-settings.service.js";
import type { AcceptEditedOrderInput, CreateOrderInput } from "./order.schemas.js";
import type { PrismaClient as SqlitePrismaClient } from "../../../generated/sqlite/index.js";
import type { OrderChange } from "./order-changes.js";
import { deliveryChargeToConfirm } from "../../lib/delivery.js";
import { isInQatar, municipalityAt, reverseGeocode } from "../../lib/geo/qatar.js";
import { auditRow, type Actor } from "../admin/audit.js";
import { recordNotification, requestSheetSync } from "../notifications/outbox.js";

// Every order read returns its lines and, when there is one, its confirmed delivery location.
const ORDER_INCLUDE = { items: true, deliveryLocation: true } as const;
// Admin screens also see whether each order's notification emails were delivered.
const ADMIN_ORDER_INCLUDE = {
  ...ORDER_INCLUDE,
  notifications: {
    orderBy: { createdAt: "asc" },
    select: { id: true, eventType: true, status: true, attempts: true, lastErrorCode: true, sentAt: true, nextAttemptAt: true },
  },
} as const;

// A confirmation older than this (or from the future) is treated as stale: the customer must confirm again.
const LOCATION_CONFIRMATION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function checkedLocation(location: CreateOrderInput["deliveryLocation"], now = Date.now()) {
  if (!location) return null;
  if (!isInQatar(location.latitude, location.longitude)) {
    throw new ApiError(400, "LOCATION_OUTSIDE_QATAR", "The delivery location must be in Qatar");
  }
  const confirmedAt = new Date(location.confirmedAt);
  if (!(confirmedAt.getTime() <= now + CLOCK_SKEW_MS && confirmedAt.getTime() >= now - LOCATION_CONFIRMATION_MAX_AGE_MS)) {
    throw new ApiError(400, "LOCATION_CONFIRMATION_STALE", "Please confirm the delivery location again");
  }
  // The neighbourhood: the customer's own wording if they gave one, otherwise our Qatar index's name for the point.
  const area = location.area ?? reverseGeocode(location.latitude, location.longitude, "en").area;
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    formattedAddress: location.formattedAddress,
    countryCode: "QA",
    source: location.source,
    precision: location.precision,
    accuracyMeters: location.accuracyMeters ?? null,
    area,
    zone: location.zone ?? null,
    street: location.street ?? null,
    building: location.building ?? null,
    unit: location.unit ?? null,
    landmark: location.landmark ?? null,
    provider: location.provider ?? null,
    providerRef: location.providerRef ?? null,
    confirmedAt,
  };
}

// Both generated clients expose the same application models; this removes the
// provider union from query method overloads without weakening query typing.
const db = prisma as unknown as SqlitePrismaClient;

const QATAR_UTC_OFFSET = "+03:00";

type PersistedOrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

type OrderStatusInput =
  | PersistedOrderStatus
  | "pending"
  | "accepted"
  | "declined"
  | "completed";

const semiStatusMap: Record<
  "pending" | "accepted" | "declined" | "completed",
  "PENDING" | "CONFIRMED" | "CANCELLED" | "DELIVERED"
> = {
  pending: "PENDING",
  accepted: "CONFIRMED",
  declined: "CANCELLED",
  completed: "DELIVERED",
};

const activeOrderTransitions: PersistedOrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

const allowedTransitions: Record<PersistedOrderStatus, PersistedOrderStatus[]> = {
  // Preserve QLeaves' existing flexible status endpoint while preventing a
  // terminal order from being reopened after stock has been released/finalized.
  PENDING: activeOrderTransitions,
  CONFIRMED: activeOrderTransitions,
  PREPARING: activeOrderTransitions,
  OUT_FOR_DELIVERY: activeOrderTransitions,
  DELIVERED: [],
  CANCELLED: [],
};

function normalizeStatus(status: OrderStatusInput): PersistedOrderStatus {
  return status === "pending" || status === "accepted" || status === "declined" || status === "completed"
    ? semiStatusMap[status]
    : status;
}

function qatarDateParts(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

function qatarDateKey(date: Date): string {
  const { year, month, day } = qatarDateParts(date);
  return `${year}-${month}-${day}`;
}

function qatarDayRange(date = new Date()): { start: Date; end: Date } {
  const key = qatarDateKey(date);
  const start = new Date(`${key}T00:00:00${QATAR_UTC_OFFSET}`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

const ORDER_SUFFIX_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// QL-YYYYMMDD-XXXXXX with a random suffix (36^6, about 2 billion per day). Two orders in the same millisecond
// no longer share a number; the unique index still guards it and createOrder retries on the rare clash.
function orderNumber() {
  const { year, month, day } = qatarDateParts(new Date());
  let suffix = "";
  for (let index = 0; index < 6; index += 1) suffix += ORDER_SUFFIX_ALPHABET[randomInt(ORDER_SUFFIX_ALPHABET.length)];
  return `QL-${year}${month}${day}-${suffix}`;
}

function uniqueViolationOn(error: unknown, field: string): boolean {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "P2002") return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : [];
  // Some drivers only report the index name, so match that too.
  return fields.some((name) => name === field || name.includes(field)) ||
    String((error as { message?: unknown }).message ?? "").includes(field);
}

// PostgreSQL gave up on a transaction because of a clash with another one (a deadlock or a serialisation failure).
// Nothing was written, so the same request can safely run again.
function transientConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const detail = `${String(code ?? "")} ${String(message ?? "")} ${JSON.stringify((error as { meta?: unknown }).meta ?? {})}`;
  return code === "P2034" || /40P01|40001|deadlock detected|could not serialize/i.test(detail);
}

const TRANSIENT_ATTEMPTS = 3;

const ORDER_NUMBER_ATTEMPTS = 3;

async function releaseReservedItems(
  tx: any,
  items: Array<{ productId: string; quantity: number }>,
): Promise<void> {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  for (const [productId, quantity] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
    await tx.inventory.upsert({
      where: { productId },
      create: { productId, quantity },
      update: { quantity: { increment: quantity } },
    });
  }
}

export type CreatedOrder = Awaited<ReturnType<typeof insertOrder>>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).filter((key) => (value as Record<string, unknown>)[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** SHA-256 of the validated order request: the same order sent again gives the same fingerprint. */
export function requestFingerprint(input: CreateOrderInput): string {
  return createHash("sha256").update(canonical(input)).digest("hex");
}

/**
 * The order already saved under this key, if any. The same key with a different request is refused: it never
 * returns someone else's order, and never places a second one.
 */
export async function findOrderForKey(idempotencyKey: string, fingerprint: string): Promise<CreatedOrder | null> {
  const existing = await db.order.findUnique({ where: { idempotencyKey }, include: ORDER_INCLUDE });
  if (!existing) return null;
  if (existing.requestFingerprint && existing.requestFingerprint !== fingerprint) {
    throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "This order request does not match the order already received with the same key");
  }
  return existing;
}

// Places an order exactly once per key. A retry (double tap, a timeout after the order was saved, a reload) gets the
// order that already exists, and two simultaneous requests with the same key cannot both create one: the unique
// index lets one win and the other returns the winner's order. The key is required; a database without the key
// column is a failed release, so the error surfaces instead of orders being taken without protection.
export async function createOrder(
  input: CreateOrderInput,
  idempotencyKey: string,
  fingerprint = requestFingerprint(input),
): Promise<{ order: CreatedOrder; replayed: boolean }> {
  const existing = await findOrderForKey(idempotencyKey, fingerprint);
  if (existing) return { order: existing, replayed: true };

  // Checked before anything is written: a bad location never leaves a half-made order behind.
  checkedLocation(input.deliveryLocation);

  const settings = await getStoreSettings();
  if (!settings.orderingEnabled) {
    throw new ApiError(503, "ORDERING_DISABLED", "Ordering is currently unavailable");
  }

  let numberClashes = 0;
  let transientFailures = 0;
  for (;;) {
    try {
      return { order: await insertOrder(input, idempotencyKey, fingerprint), replayed: false };
    } catch (error) {
      if (uniqueViolationOn(error, "idempotencyKey")) {
        const winner = await findOrderForKey(idempotencyKey, fingerprint);
        if (winner) return { order: winner, replayed: true };
      }
      if (uniqueViolationOn(error, "orderNumber") && ++numberClashes < ORDER_NUMBER_ATTEMPTS) continue;
      if (transientConflict(error) && ++transientFailures < TRANSIENT_ATTEMPTS) continue;
      throw error;
    }
  }
}

async function insertOrder(input: CreateOrderInput, idempotencyKey: string, fingerprint: string) {
  return db.$transaction(async (tx) => {
    const quantities = new Map<string, number>();
    for (const item of input.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }

    // Prices, names and SKUs come from the database at this moment, never from the request; the order
    // items keep them as a snapshot so later price or name changes never rewrite an old order.
    const products = await tx.product.findMany({
      // A published product without a real price can never be bought.
      where: { id: { in: [...quantities.keys()] }, published: true, priceQar: { gt: 0 } },
      select: { id: true, name: true, sku: true, priceQar: true },
      // Stock rows are always locked in the same (id) order, so two orders for the same plants can never wait on
      // each other in opposite order (a PostgreSQL deadlock).
      orderBy: { id: "asc" },
    });
    if (products.length !== quantities.size) {
      throw new ApiError(400, "PRODUCT_NOT_FOUND", "One or more products are unavailable");
    }

    // The customer agreed to a total. If a price changed since, nothing is charged at the new price without asking.
    const priced = products.reduce((total, product) => total + product.priceQar * quantities.get(product.id)!, 0);
    if (input.expectedSubtotalQar !== undefined && input.expectedSubtotalQar !== priced) {
      throw new ApiError(409, "PRICE_CHANGED", "Prices have changed since this order was prepared", {
        subtotalQar: priced,
        items: products.map((product) => ({ productId: product.id, name: product.name, priceQar: product.priceQar })),
      });
    }

    const items = [];
    let subtotalQar = 0;
    for (const product of products) {
      const quantity = quantities.get(product.id)!;
      const updated = await tx.inventory.updateMany({
        where: { productId: product.id, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (updated.count !== 1) {
        throw new ApiError(409, "INSUFFICIENT_STOCK", `${product.name} is out of stock`);
      }
      subtotalQar += product.priceQar * quantity;
      items.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPriceQar: product.priceQar,
        quantity,
      });
    }

    const order = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        idempotencyKey,
        requestFingerprint: fingerprint,
        customerName: input.customerName,
        phone: input.phone,
        email: input.email,
        addressLine1: input.addressLine1,
        // With a confirmed pin, the order's area is the municipality the pin is in (so the two can never disagree).
        area: (input.deliveryLocation && municipalityAt(input.deliveryLocation.latitude, input.deliveryLocation.longitude)?.label) || input.area,
        deliveryNotes: input.deliveryNotes,
        paymentMethod: input.paymentMethod,
        subtotalQar,
        // No delivery fee is priced online. At or above the free-delivery threshold delivery is free; below it the
        // team confirms the charge with the customer, so the order is flagged and the fee stays unset (0) until an
        // admin enters it. Decided here from the server's own subtotal, never from the request.
        deliveryFeeQar: 0,
        deliveryChargePending: deliveryChargeToConfirm(subtotalQar),
        // Saved in the same transaction as the order, so an order and its location are never separated.
        ...(input.deliveryLocation ? { deliveryLocation: { create: checkedLocation(input.deliveryLocation)! } } : {}),
        deliveryLocationManual: !input.deliveryLocation && input.deliveryLocationManual === true,
        items: { create: items },
      },
      include: ORDER_INCLUDE,
    });
    // The admin's new-order email is recorded with the order itself: both are saved or neither is.
    await recordNotification(tx, { orderId: order.id, eventType: "ORDER_CREATED", dedupeKey: `order-created:${order.id}` });
    // And its Google Sheet job (the sheet only lists completed, paid orders, so for now this has nothing to write).
    await requestSheetSync(tx, order.id);
    return order;
  });
}

export async function listOrders() {
  return db.order.findMany({ orderBy: { createdAt: "desc" }, include: ADMIN_ORDER_INCLUDE });
}

export async function updateOrderStatus(id: string, status: OrderStatusInput, actor: Actor) {
  const persistedStatus = normalizeStatus(status);

  return db.$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({ where: { id }, include: ADMIN_ORDER_INCLUDE });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");

    if (order.status === persistedStatus) return order;

    const currentStatus = order.status as PersistedOrderStatus;
    if (!allowedTransitions[currentStatus]?.includes(persistedStatus)) {
      throw new ApiError(
        409,
        "INVALID_ORDER_TRANSITION",
        `Order cannot move from ${currentStatus} to ${persistedStatus}`,
      );
    }

    // The status is changed only if it is still what was just read. Two requests arriving together (a double tap,
    // two admins) cannot both win, so stock is put back once and only once.
    const written = await tx.order.updateMany({ where: { id, status: currentStatus }, data: { status: persistedStatus } });
    if (written.count !== 1) throw new ApiError(409, "ORDER_CHANGED", "This order was just changed by someone else. Reload and try again");

    if (persistedStatus === "CANCELLED") {
      await releaseReservedItems(tx, order.items);
    }

    await tx.adminAuditLog.create({ data: auditRow(actor, "order.status", order, { from: currentStatus, to: persistedStatus }) });
    await requestSheetSync(tx, id);
    return tx.order.findUnique({ where: { id }, include: ADMIN_ORDER_INCLUDE });
  });
}

export async function acceptEditedOrder(id: string, input: AcceptEditedOrderInput, actor: Actor) {
  return db.$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({ where: { id }, include: ADMIN_ORDER_INCLUDE });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "PENDING") {
      throw new ApiError(409, "ORDER_NOT_PENDING", "Only pending orders can be edited before acceptance");
    }

    // Claim the order first: if another request has just accepted, declined or edited it, this one stops here
    // before any stock is moved. (If a later check fails, the whole transaction, this claim included, is undone.)
    const claimed = await tx.order.updateMany({ where: { id, status: "PENDING" }, data: { status: "CONFIRMED" } });
    if (claimed.count !== 1) throw new ApiError(409, "ORDER_CHANGED", "This order was just changed by someone else. Reload and try again");

    const editIds = input.items.map((item) => item.orderItemId);
    if (new Set(editIds).size !== editIds.length || input.items.length !== order.items.length) {
      throw new ApiError(400, "INVALID_ORDER_EDIT", "Every order line must be included exactly once");
    }

    const originalById = new Map<string, any>(order.items.map((item: any) => [item.id, item]));
    for (const edit of input.items) {
      if (!originalById.has(edit.orderItemId)) {
        throw new ApiError(400, "INVALID_ORDER_EDIT", "Edited order contains an unknown order line");
      }
    }

    const included = input.items.filter((item) => item.included);
    if (!included.length) {
      throw new ApiError(400, "EMPTY_ORDER", "At least one item must be included");
    }

    const targetIds = [...new Set(included.map((item) => item.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, name: true, sku: true, priceQar: true, published: true },
    });
    if (products.length !== targetIds.length) {
      throw new ApiError(400, "PRODUCT_NOT_FOUND", "One or more replacement products are unavailable");
    }
    const productById = new Map<string, any>(products.map((product: any) => [product.id, product]));

    for (const edit of included) {
      const original = originalById.get(edit.orderItemId)!;
      const target = productById.get(edit.productId)!;
      if (edit.productId !== original.productId && !target.published) {
        throw new ApiError(400, "PRODUCT_NOT_AVAILABLE", `${target.name} is not available for substitution`);
      }
    }

    const currentReservations = new Map<string, number>();
    for (const item of order.items) {
      currentReservations.set(
        item.productId,
        (currentReservations.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const desiredReservations = new Map<string, number>();
    for (const edit of included) {
      desiredReservations.set(
        edit.productId,
        (desiredReservations.get(edit.productId) ?? 0) + edit.quantity,
      );
    }

    // Same fixed (id) order as order creation, so an edit and a new order never deadlock on stock rows.
    const allProductIds = [...new Set([...currentReservations.keys(), ...desiredReservations.keys()])].sort();
    for (const productId of allProductIds) {
      const current = currentReservations.get(productId) ?? 0;
      const desired = desiredReservations.get(productId) ?? 0;
      const delta = desired - current;

      if (delta > 0) {
        const updated = await tx.inventory.updateMany({
          where: { productId, quantity: { gte: delta } },
          data: { quantity: { decrement: delta } },
        });
        if (updated.count !== 1) {
          const product = productById.get(productId);
          throw new ApiError(
            409,
            "INSUFFICIENT_STOCK",
            `${product?.name ?? "A replacement product"} does not have enough stock`,
          );
        }
      } else if (delta < 0) {
        await tx.inventory.upsert({
          where: { productId },
          create: { productId, quantity: -delta },
          update: { quantity: { increment: -delta } },
        });
      }
    }

    const replacementLines = included.map((edit) => {
      const original = originalById.get(edit.orderItemId)!;
      const product = productById.get(edit.productId)!;
      const unitPriceQar = edit.productId === original.productId
        ? original.unitPriceQar
        : product.priceQar;
      return {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unitPriceQar,
        quantity: edit.quantity,
      };
    });
    const subtotalQar = replacementLines.reduce(
      (total, item) => total + item.unitPriceQar * item.quantity,
      0,
    );

    const changes: OrderChange[] = [];
    for (const edit of input.items) {
      const original = originalById.get(edit.orderItemId)!;
      if (!edit.included) {
        changes.push({ type: "removed", name: original.productName, quantity: original.quantity });
      } else if (edit.productId !== original.productId) {
        changes.push({ type: "replaced", from: original.productName, to: productById.get(edit.productId)!.name, quantity: edit.quantity });
      } else if (edit.quantity !== original.quantity) {
        changes.push({ type: "quantity", name: original.productName, from: original.quantity, to: edit.quantity });
      }
    }

    await tx.orderItem.deleteMany({ where: { orderId: id } });
    for (const line of replacementLines) {
      await tx.orderItem.create({ data: { orderId: id, ...line } });
    }

    await tx.adminAuditLog.create({
      data: auditRow(actor, "order.edit", order, {
        status: { from: "PENDING", to: "CONFIRMED" },
        subtotalQar: { from: order.subtotalQar, to: subtotalQar },
        changes: changes.length,
      }),
    });
    await requestSheetSync(tx, id);
    return tx.order.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        subtotalQar,
        editSummary: changes.length ? JSON.stringify(changes) : null,
        // An edit can move the subtotal across the threshold; a charge an admin already confirmed is kept.
        ...(order.deliveryFeeConfirmedAt ? {} : { deliveryChargePending: deliveryChargeToConfirm(subtotalQar) }),
      },
      include: ADMIN_ORDER_INCLUDE,
    });
  });
}

// The admin enters the delivery charge agreed with the customer (0 is allowed). It is added to the invoice total.
// A charge can be corrected while the order is open; every confirmation or correction is recorded with the admin's
// name. Once the order is paid the charge is final: the customer has already paid a total that included it.
export async function confirmDeliveryFee(id: string, deliveryFeeQar: number, actor: Actor) {
  return db.$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({
      where: { id },
      select: { id: true, orderNumber: true, status: true, paymentStatus: true, deliveryFeeQar: true, deliveryFeeConfirmedAt: true },
    });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status === "CANCELLED") throw new ApiError(409, "ORDER_CLOSED", "A declined order cannot be changed");
    if (order.paymentStatus === "PAID") {
      throw new ApiError(409, "DELIVERY_FEE_FINAL", "This order is already paid, so its delivery charge can no longer be changed");
    }
    const previous: number | null = order.deliveryFeeConfirmedAt ? order.deliveryFeeQar : null;
    if (previous === deliveryFeeQar) return tx.order.findUnique({ where: { id }, include: ADMIN_ORDER_INCLUDE });

    // The conditions are repeated in the write itself, so a payment or a decline that lands at the same moment
    // cannot slip in between the check above and this update.
    const written = await tx.order.updateMany({
      where: { id, status: { not: "CANCELLED" }, paymentStatus: { not: "PAID" } },
      data: { deliveryFeeQar, deliveryChargePending: false, deliveryFeeConfirmedAt: new Date(), deliveryFeeConfirmedBy: actor.name },
    });
    if (written.count !== 1) throw new ApiError(409, "ORDER_CHANGED", "This order was just changed by someone else. Reload and try again");
    await tx.adminAuditLog.create({ data: auditRow(actor, "order.deliveryFee", order, { from: previous, to: deliveryFeeQar }) });
    await requestSheetSync(tx, id);
    return tx.order.findUnique({ where: { id }, include: ADMIN_ORDER_INCLUDE });
  });
}

// Payment status is set by an admin (cash on delivery, payment link). A declined order can never become paid, and
// an order is not marked paid while its delivery charge is still to be confirmed, because its total is not final.
// A missing order is a 404; any other failure (for example the database being down) keeps its own error.
export async function updatePaymentStatus(
  id: string,
  paymentStatus: "PENDING" | "PAID" | "FAILED",
  actor: Actor,
) {
  return db.$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({
      where: { id },
      select: { id: true, orderNumber: true, status: true, paymentStatus: true, deliveryChargePending: true },
    });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.paymentStatus === paymentStatus) return tx.order.findUnique({ where: { id }, include: ADMIN_ORDER_INCLUDE });
    if (paymentStatus === "PAID") {
      if (order.status === "CANCELLED") throw new ApiError(409, "ORDER_CLOSED", "A declined order cannot be marked paid");
      if (order.deliveryChargePending) {
        throw new ApiError(409, "DELIVERY_CHARGE_PENDING", "Confirm the delivery charge before marking this order paid");
      }
    }
    const written = await tx.order.updateMany({
      where: {
        id,
        paymentStatus: order.paymentStatus,
        ...(paymentStatus === "PAID" ? { status: { not: "CANCELLED" }, deliveryChargePending: false } : {}),
      },
      data: { paymentStatus },
    });
    if (written.count !== 1) throw new ApiError(409, "ORDER_CHANGED", "This order was just changed by someone else. Reload and try again");
    await tx.adminAuditLog.create({ data: auditRow(actor, "order.payment", order, { from: order.paymentStatus, to: paymentStatus }) });
    await requestSheetSync(tx, id);
    return tx.order.findUnique({ where: { id }, include: ADMIN_ORDER_INCLUDE });
  });
}

export async function deleteOrder(id: string, actor: Actor) {
  await db.$transaction(async (tx: any) => {
    const existing = await tx.order.findUnique({ where: { id }, select: { id: true, orderNumber: true, status: true, paymentStatus: true } });
    if (!existing) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
    if (existing.status !== "CANCELLED" && existing.status !== "DELIVERED") {
      throw new ApiError(409, "ORDER_NOT_DELETABLE", "Only declined or completed orders can be deleted");
    }
    await tx.adminAuditLog.create({ data: auditRow(actor, "order.delete", existing, { status: existing.status, paymentStatus: existing.paymentStatus }) });
    await tx.order.delete({ where: { id } });
  });
}

export async function deleteOrders(ids: string[], actor: Actor) {
  await db.$transaction(async (transaction: any) => {
    const orders = await transaction.order.findMany({
      where: { id: { in: ids } },
      select: { id: true, orderNumber: true, status: true, paymentStatus: true },
    });
    if (orders.length !== ids.length) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "One or more orders were not found");
    }
    if (orders.some((order: { status: string }) => order.status !== "CANCELLED" && order.status !== "DELIVERED")) {
      throw new ApiError(409, "ORDER_NOT_DELETABLE", "Only declined or completed orders can be deleted");
    }
    for (const order of orders) {
      await transaction.adminAuditLog.create({ data: auditRow(actor, "order.delete", order, { status: order.status, paymentStatus: order.paymentStatus }) });
    }
    await transaction.order.deleteMany({ where: { id: { in: ids } } });
  });
}

export async function dashboardStats() {
  const { start, end } = qatarDayRange();
  const [ordersToday, inventory, lowStock, pending] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: start, lt: end } } }),
    db.inventory.aggregate({ _sum: { quantity: true } }),
    db.inventory.count({ where: { quantity: { lte: 5 } } }),
    db.order.aggregate({
      _sum: { subtotalQar: true, deliveryFeeQar: true },
      where: { paymentStatus: "PENDING", status: { not: "CANCELLED" } },
    }),
  ]);
  return {
    ordersToday,
    liveInventory: inventory._sum.quantity ?? 0,
    lowStock,
    // What is still to be collected: goods plus the delivery charges confirmed so far.
    pendingPayoutsQar: (pending._sum.subtotalQar ?? 0) + (pending._sum.deliveryFeeQar ?? 0),
    pendingMerchandiseQar: pending._sum.subtotalQar ?? 0,
    pendingDeliveryQar: pending._sum.deliveryFeeQar ?? 0,
  };
}

export async function salesReport(from?: Date, to?: Date) {
  const where = {
    status: "DELIVERED" as const,
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
      : {}),
  };
  const orders = await db.order.findMany({
    where,
    select: {
      subtotalQar: true,
      deliveryFeeQar: true,
      createdAt: true,
      paymentStatus: true,
      items: { select: { productName: true, quantity: true } },
    },
  });

  // "revenue" figures are merchandise only, as they always were. Delivery charges and the totals customers actually
  // pay are reported beside them, never mixed in.
  const byDay = new Map<string, { orders: number; revenueQar: number; deliveryQar: number; totalQar: number }>();
  const sold = new Map<string, number>();
  let merchandiseQar = 0;
  let deliveryQar = 0;
  let paidRevenueQar = 0;
  let paidTotalQar = 0;

  for (const order of orders) {
    const total = order.subtotalQar + order.deliveryFeeQar;
    const day = qatarDateKey(order.createdAt);
    const current = byDay.get(day) ?? { orders: 0, revenueQar: 0, deliveryQar: 0, totalQar: 0 };
    current.orders += 1;
    current.revenueQar += order.subtotalQar;
    current.deliveryQar += order.deliveryFeeQar;
    current.totalQar += total;
    byDay.set(day, current);

    merchandiseQar += order.subtotalQar;
    deliveryQar += order.deliveryFeeQar;
    if (order.paymentStatus === "PAID") {
      paidRevenueQar += order.subtotalQar;
      paidTotalQar += total;
    }
    for (const item of order.items) {
      sold.set(item.productName, (sold.get(item.productName) ?? 0) + item.quantity);
    }
  }

  const totalQar = merchandiseQar + deliveryQar;

  return {
    orders: orders.length,
    revenueQar: merchandiseQar,
    paidRevenueQar,
    unpaidRevenueQar: merchandiseQar - paidRevenueQar,
    merchandiseQar,
    deliveryQar,
    totalQar,
    paidTotalQar,
    unpaidTotalQar: totalQar - paidTotalQar,
    topItems: [...sold.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([name, quantity]) => ({ name, quantity })),
    byDay: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values })),
  };
}
