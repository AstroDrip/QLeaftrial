import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import type { CreateOrderInput } from "./order.schemas.js";
import type { PrismaClient as SqlitePrismaClient } from "../../../generated/sqlite/index.js";
// Both generated clients expose the same application models; this removes the
// provider union from query method overloads without weakening query typing.
const db = prisma as unknown as SqlitePrismaClient;

function orderNumber() {
  return `QL-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
}

export async function createOrder(input: CreateOrderInput) {
  return db.$transaction(async (tx: any) => {
    const quantities = new Map<string, number>();
    for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    const products = await tx.product.findMany({ where: { id: { in: [...quantities.keys()] } }, select: { id: true, name: true, sku: true, priceQar: true } });
    if (products.length !== quantities.size) throw new ApiError(400, "PRODUCT_NOT_FOUND", "One or more products are unavailable");
    const items = [];
    let subtotalQar = 0;
    for (const product of products) {
      const quantity = quantities.get(product.id)!;
      const updated = await tx.inventory.updateMany({ where: { productId: product.id, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
      if (updated.count !== 1) throw new ApiError(409, "INSUFFICIENT_STOCK", `${product.name} is out of stock`);
      subtotalQar += product.priceQar * quantity;
      items.push({ productId: product.id, productName: product.name, sku: product.sku, unitPriceQar: product.priceQar, quantity });
    }
    return tx.order.create({
      data: { orderNumber: orderNumber(), customerName: input.customerName, phone: input.phone, email: input.email, addressLine1: input.addressLine1, area: input.area, deliveryNotes: input.deliveryNotes, paymentMethod: input.paymentMethod, subtotalQar, items: { create: items } },
      include: { items: true },
    });
  });
}

export async function listOrders() {
  return db.order.findMany({ orderBy: { createdAt: "desc" }, include: { items: true } });
}

type OrderStatusInput = "PENDING" | "CONFIRMED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" | "pending" | "accepted" | "declined" | "completed";
const semiStatusMap: Record<"pending" | "accepted" | "declined" | "completed", "PENDING" | "CONFIRMED" | "CANCELLED" | "DELIVERED"> = {
  pending: "PENDING", accepted: "CONFIRMED", declined: "CANCELLED", completed: "DELIVERED",
};

export async function updateOrderStatus(id: string, status: OrderStatusInput) {
  const order = await db.order.findUnique({ where: { id } });
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
  const persistedStatus = status === "pending" || status === "accepted" || status === "declined" || status === "completed"
    ? semiStatusMap[status]
    : status;
  return db.order.update({ where: { id }, data: { status: persistedStatus }, include: { items: true } });
}

export async function updatePaymentStatus(id: string, paymentStatus: "PENDING" | "PAID" | "FAILED") {
  try { return await db.order.update({ where: { id }, data: { paymentStatus }, include: { items: true } }); }
  catch { throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found"); }
}

export async function deleteOrder(id: string) {
  const existing = await db.order.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
  if (existing.status !== "CANCELLED" && existing.status !== "DELIVERED") {
    throw new ApiError(409, "ORDER_NOT_DELETABLE", "Only declined or completed orders can be deleted");
  }
  await db.order.delete({ where: { id } });
}

export async function dashboardStats() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const [ordersToday, inventory, lowStock, pending] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: start } } }),
    db.inventory.aggregate({ _sum: { quantity: true } }),
    db.inventory.count({ where: { quantity: { lte: 5 } } }),
    db.order.aggregate({ _sum: { subtotalQar: true }, where: { paymentStatus: "PENDING" } }),
  ]);
  return { ordersToday, liveInventory: inventory._sum.quantity ?? 0, lowStock, pendingPayoutsQar: pending._sum.subtotalQar ?? 0 };
}

export async function salesReport(from?: Date, to?: Date) {
  const where = {
    status: "DELIVERED" as const,
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
  const orders = await db.order.findMany({ where, select: { subtotalQar: true, createdAt: true } });
  const byDay = new Map<string, { orders: number; revenueQar: number }>();
  for (const order of orders) {
    const day = order.createdAt.toISOString().slice(0, 10);
    const current = byDay.get(day) ?? { orders: 0, revenueQar: 0 };
    current.orders += 1;
    current.revenueQar += order.subtotalQar;
    byDay.set(day, current);
  }
  return {
    orders: orders.length,
    revenueQar: orders.reduce((total: number, order: { subtotalQar: number }) => total + order.subtotalQar, 0),
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...values })),
  };
}
