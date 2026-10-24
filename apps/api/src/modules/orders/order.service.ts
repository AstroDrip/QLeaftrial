import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import { getStoreSettings } from "../admin/store-settings.service.js";
import type { AcceptEditedOrderInput, CreateOrderInput } from "./order.schemas.js";
import type { PrismaClient as SqlitePrismaClient } from "../../../generated/sqlite/index.js";

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

function orderNumber() {
  const { year, month, day } = qatarDateParts(new Date());
  return `QL-${year}${month}${day}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

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

export async function createOrder(input: CreateOrderInput) {
  const settings = await getStoreSettings();
  if (!settings.orderingEnabled) {
    throw new ApiError(503, "ORDERING_DISABLED", "Ordering is currently unavailable");
  }
  if (settings.deliveryFeeQar === null) {
    throw new ApiError(503, "DELIVERY_NOT_CONFIGURED", "Delivery pricing is not configured yet");
  }
  if (input.deliveryFeeQar !== settings.deliveryFeeQar) {
    throw new ApiError(409, "DELIVERY_PRICE_CHANGED", "Delivery pricing changed. Review the updated total before ordering");
  }
  return db.$transaction(async (tx: any) => {
    const quantities = new Map<string, number>();
    for (const item of input.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }

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
        customerName: input.customerName,
        phone: input.phone,
        email: input.email,
        addressLine1: input.addressLine1,
        area: input.area,
        deliveryNotes: input.deliveryNotes,
        paymentMethod: input.paymentMethod,
        subtotalQar,
        deliveryFeeQar: settings.deliveryFeeQar,
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

    await tx.orderItem.deleteMany({ where: { orderId: id } });
    for (const line of replacementLines) {
      await tx.orderItem.create({ data: { orderId: id, ...line } });
    }

    return tx.order.update({
      where: { id },
      data: { status: "CONFIRMED", subtotalQar },
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
  const uniqueIds = [...new Set(ids)];
  return db.$transaction(async (tx: any) => {
    const orders = await tx.order.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, status: true },
    });
    if (orders.length !== uniqueIds.length) {
      throw new ApiError(404, "ORDER_NOT_FOUND", "One or more orders were not found");
    }
    const blocked = orders.find(
      (order: { status: string }) => order.status !== "CANCELLED" && order.status !== "DELIVERED",
    );
    if (blocked) {
      throw new ApiError(
        409,
        "ORDER_NOT_DELETABLE",
        "Only declined or completed orders can be deleted",
      );
    }
    const result = await tx.order.deleteMany({ where: { id: { in: uniqueIds } } });
    return { deleted: result.count };
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
