import { randomInt } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import { getStoreSettings } from "../admin/store-settings.service.js";
import type { AcceptEditedOrderInput, CreateOrderInput } from "./order.schemas.js";
import type { PrismaClient as SqlitePrismaClient } from "../../../generated/sqlite/index.js";
import type { OrderChange } from "./order-changes.js";

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

// Until the idempotency column has been added to a database (see docs/deployment/operator-checklist.md),
// an order is still accepted without the key rather than checkout breaking.
function missingIdempotencyColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const detail = String(message ?? "") + JSON.stringify((error as { meta?: unknown }).meta ?? {});
  return (code === "P2022" || /column/i.test(detail)) && /idempotencyKey/.test(detail);
}

const ORDER_NUMBER_ATTEMPTS = 3;

async function releaseReservedItems(
  tx: any,
  items: Array<{ productId: string; quantity: number }>,
): Promise<void> {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  for (const [productId, quantity] of quantities) {
    await tx.inventory.upsert({
      where: { productId },
      create: { productId, quantity },
      update: { quantity: { increment: quantity } },
    });
  }
}

export type CreatedOrder = Awaited<ReturnType<typeof insertOrder>>;

// Places an order exactly once. With an idempotency key, a retry (double tap, a timeout after the order was
// saved, a reload) gets the order that already exists, and two simultaneous requests with the same key
// cannot both create one: the unique index lets one win and the other returns the winner's order.
export async function createOrder(
  input: CreateOrderInput,
  idempotencyKey?: string,
): Promise<{ order: CreatedOrder; replayed: boolean }> {
  let key = idempotencyKey;
  if (key) {
    const existing = await findOrderByIdempotencyKey(key);
    if (existing) return { order: existing, replayed: true };
  }

  const settings = await getStoreSettings();
  if (!settings.orderingEnabled) {
    throw new ApiError(503, "ORDERING_DISABLED", "Ordering is currently unavailable");
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      return { order: await insertOrder(input, key), replayed: false };
    } catch (error) {
      if (key && uniqueViolationOn(error, "idempotencyKey")) {
        const existing = await findOrderByIdempotencyKey(key);
        if (existing) return { order: existing, replayed: true };
      }
      if (key && missingIdempotencyColumn(error)) {
        console.warn(JSON.stringify({ level: "warn", event: "order-idempotency-unavailable", reason: "column missing; run the pending migration" }));
        key = undefined;
        continue;
      }
      if (uniqueViolationOn(error, "orderNumber") && attempt < ORDER_NUMBER_ATTEMPTS) continue;
      throw error;
    }
  }
}

async function findOrderByIdempotencyKey(idempotencyKey: string) {
  try {
    return await db.order.findUnique({ where: { idempotencyKey }, include: { items: true } });
  } catch (error) {
    if (missingIdempotencyColumn(error)) return null;
    throw error;
  }
}

async function insertOrder(input: CreateOrderInput, idempotencyKey: string | undefined) {
  return db.$transaction(async (tx) => {
    const quantities = new Map<string, number>();
    for (const item of input.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }

    // Prices, names and SKUs come from the database at this moment, never from the request; the order
    // items keep them as a snapshot so later price or name changes never rewrite an old order.
    const products = await tx.product.findMany({
      where: { id: { in: [...quantities.keys()] }, published: true },
      select: { id: true, name: true, sku: true, priceQar: true },
    });
    if (products.length !== quantities.size) {
      throw new ApiError(400, "PRODUCT_NOT_FOUND", "One or more products are unavailable");
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

    return tx.order.create({
      data: {
        orderNumber: orderNumber(),
        ...(idempotencyKey ? { idempotencyKey } : {}),
        customerName: input.customerName,
        phone: input.phone,
        email: input.email,
        addressLine1: input.addressLine1,
        area: input.area,
        deliveryNotes: input.deliveryNotes,
        paymentMethod: input.paymentMethod,
        subtotalQar,
        // Delivery is free today: the shop has never charged a fee at checkout. A fee would be added here,
        // from the store settings, never from the request.
        deliveryFeeQar: 0,
        items: { create: items },
      },
      include: { items: true },
    });
  });
}

export async function listOrders() {
  return db.order.findMany({ orderBy: { createdAt: "desc" }, include: { items: true } });
}

export async function updateOrderStatus(id: string, status: OrderStatusInput) {
  const persistedStatus = normalizeStatus(status);

  return db.$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
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

    if (persistedStatus === "CANCELLED") {
      await releaseReservedItems(tx, order.items);
    }

    return tx.order.update({
      where: { id },
      data: { status: persistedStatus },
      include: { items: true },
    });
  });
}

export async function acceptEditedOrder(id: string, input: AcceptEditedOrderInput) {
  return db.$transaction(async (tx: any) => {
    const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "PENDING") {
      throw new ApiError(409, "ORDER_NOT_PENDING", "Only pending orders can be edited before acceptance");
    }

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

    const allProductIds = new Set([...currentReservations.keys(), ...desiredReservations.keys()]);
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

    return tx.order.update({
      where: { id },
      data: { status: "CONFIRMED", subtotalQar, editSummary: changes.length ? JSON.stringify(changes) : null },
      include: { items: true },
    });
  });
}

export async function updatePaymentStatus(
  id: string,
  paymentStatus: "PENDING" | "PAID" | "FAILED",
) {
  try {
    return await db.order.update({
      where: { id },
      data: { paymentStatus },
      include: { items: true },
    });
  } catch {
    throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
  }
}

export async function deleteOrder(id: string) {
  const existing = await db.order.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
  if (existing.status !== "CANCELLED" && existing.status !== "DELIVERED") {
    throw new ApiError(409, "ORDER_NOT_DELETABLE", "Only declined or completed orders can be deleted");
  }
  await db.order.delete({ where: { id } });
}

export async function deleteOrders(ids: string[]) {
  await db.$transaction(async (transaction) => {
    const orders = await transaction.order.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });
    if (orders.length !== ids.length) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "One or more orders were not found");
    }
    if (orders.some((order) => order.status !== "CANCELLED" && order.status !== "DELIVERED")) {
      throw new ApiError(409, "ORDER_NOT_DELETABLE", "Only declined or completed orders can be deleted");
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
      _sum: { subtotalQar: true },
      where: { paymentStatus: "PENDING", status: { not: "CANCELLED" } },
    }),
  ]);
  return {
    ordersToday,
    liveInventory: inventory._sum.quantity ?? 0,
    lowStock,
    pendingPayoutsQar: pending._sum.subtotalQar ?? 0,
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
      createdAt: true,
      paymentStatus: true,
      items: { select: { productName: true, quantity: true } },
    },
  });

  const byDay = new Map<string, { orders: number; revenueQar: number }>();
  const sold = new Map<string, number>();
  let paidRevenueQar = 0;

  for (const order of orders) {
    const day = qatarDateKey(order.createdAt);
    const current = byDay.get(day) ?? { orders: 0, revenueQar: 0 };
    current.orders += 1;
    current.revenueQar += order.subtotalQar;
    byDay.set(day, current);

    if (order.paymentStatus === "PAID") paidRevenueQar += order.subtotalQar;
    for (const item of order.items) {
      sold.set(item.productName, (sold.get(item.productName) ?? 0) + item.quantity);
    }
  }

  const revenueQar = orders.reduce(
    (total: number, order: { subtotalQar: number }) => total + order.subtotalQar,
    0,
  );

  return {
    orders: orders.length,
    revenueQar,
    paidRevenueQar,
    unpaidRevenueQar: revenueQar - paidRevenueQar,
    topItems: [...sold.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([name, quantity]) => ({ name, quantity })),
    byDay: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values })),
  };
}
