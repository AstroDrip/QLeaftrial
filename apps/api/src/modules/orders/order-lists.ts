import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import { containsText, pageOf, pageQuerySchema, qatarDayOf, qatarDayStart, skipFor, type Page } from "../../lib/paging.js";
import { ADMIN_ORDER_INCLUDE_FOR_LISTS } from "./order.service.js";

// Paged admin views of orders and invoices: filtering, counting and adding up happen in the database, so the
// admin stays quick with thousands of orders.
const db = prisma as any;

export const ORDER_TABS = {
  PENDING: ["PENDING"],
  CONFIRMED: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"],
  CANCELLED: ["CANCELLED"],
  DELIVERED: ["DELIVERED"],
} as const;
export type OrderTab = keyof typeof ORDER_TABS;

export const orderPageSchema = pageQuerySchema.extend({
  tab: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "DELIVERED"]).default("PENDING"),
  sort: z.enum(["newest", "oldest", "total-desc"]).default("newest"),
});

function searchWhere(q: string | undefined) {
  if (!q) return {};
  return { OR: [{ orderNumber: containsText(q) }, { customerName: containsText(q) }, { phone: containsText(q) }] };
}

export async function listOrdersPage(query: z.infer<typeof orderPageSchema>): Promise<Page<unknown> & { counts: Record<OrderTab, number> }> {
  const where = { status: { in: [...ORDER_TABS[query.tab]] }, ...searchWhere(query.q) };
  const orderBy = query.sort === "oldest" ? [{ createdAt: "asc" }] : query.sort === "total-desc" ? [{ subtotalQar: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }];
  const [items, totalItems, grouped] = await Promise.all([
    db.order.findMany({ where, orderBy, skip: skipFor(query.page, query.pageSize), take: query.pageSize, include: ADMIN_ORDER_INCLUDE_FOR_LISTS }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], where: searchWhere(query.q), _count: { _all: true } }),
  ]);
  const counts = { PENDING: 0, CONFIRMED: 0, CANCELLED: 0, DELIVERED: 0 } as Record<OrderTab, number>;
  for (const row of grouped as Array<{ status: string; _count: { _all: number } }>) {
    const tab = (Object.keys(ORDER_TABS) as OrderTab[]).find((key) => (ORDER_TABS[key] as readonly string[]).includes(row.status));
    if (tab) counts[tab] += row._count._all;
  }
  return { ...pageOf(items, query.page, query.pageSize, totalItems), counts };
}

/** Every order id in a finished tab (declined or completed), for "Clear" (deleted in chunks of 100). */
export async function orderIdsInTab(tab: "CANCELLED" | "DELIVERED"): Promise<string[]> {
  const rows = await db.order.findMany({ where: { status: tab }, select: { id: true } });
  return rows.map((row: { id: string }) => row.id);
}

export async function getAdminOrder(id: string) {
  const order = await db.order.findUnique({ where: { id }, include: ADMIN_ORDER_INCLUDE_FOR_LISTS });
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
  return order;
}

export const invoicePageSchema = pageQuerySchema.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payment: z.enum(["all", "paid", "unpaid"]).default("all"),
});

const nextDay = (day: string) => new Date(qatarDayStart(day).getTime() + 24 * 60 * 60 * 1000);

/** Invoices: every order that was not declined, newest first, with totals for the whole filter and per day. */
export async function listInvoicesPage(query: z.infer<typeof invoicePageSchema>) {
  const createdAt = { ...(query.from ? { gte: qatarDayStart(query.from) } : {}), ...(query.to ? { lt: nextDay(query.to) } : {}) };
  const payment = query.payment === "paid" ? { paymentStatus: "PAID" } : query.payment === "unpaid" ? { paymentStatus: { not: "PAID" } } : {};
  const where = { status: { not: "CANCELLED" }, ...(query.from || query.to ? { createdAt } : {}), ...payment, ...searchWhere(query.q) };
  const sum = async (extra: object) => {
    const grouped = await db.order.groupBy({ by: ["paymentStatus"], where: { ...where, ...extra }, _sum: { subtotalQar: true, deliveryFeeQar: true }, _count: { _all: true } });
    let paidQar = 0; let unpaidQar = 0; let count = 0;
    for (const row of grouped as Array<{ paymentStatus: string; _sum: { subtotalQar: number | null; deliveryFeeQar: number | null }; _count: { _all: number } }>) {
      const total = (row._sum.subtotalQar ?? 0) + (row._sum.deliveryFeeQar ?? 0);
      if (row.paymentStatus === "PAID") paidQar += total; else unpaidQar += total;
      count += row._count._all;
    }
    return { count, totalQar: paidQar + unpaidQar, paidQar, unpaidQar };
  };
  const [items, totals] = await Promise.all([
    db.order.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: skipFor(query.page, query.pageSize), take: query.pageSize, include: ADMIN_ORDER_INCLUDE_FOR_LISTS }),
    sum({}),
  ]);
  // Day totals cover the whole day, not only the part of it on this page.
  const days = [...new Set(items.map((order: { createdAt: Date }) => qatarDayOf(order.createdAt)))] as string[];
  const dayTotals = Object.fromEntries(await Promise.all(days.map(async (day) => {
    const within = { gte: new Date(Math.max(qatarDayStart(day).getTime(), createdAt.gte?.getTime() ?? 0)), lt: nextDay(day) };
    return [day, (await sum({ createdAt: within })).totalQar] as const;
  })));
  return { ...pageOf(items, query.page, query.pageSize, totals.count), totals, dayTotals };
}
