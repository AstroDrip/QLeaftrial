import { prisma } from "../../lib/prisma.js";

// Who is acting. Taken from the admin session, never from the request body.
export type Actor = { id: string | null; name: string };

export type AuditAction = "order.status" | "order.payment" | "order.deliveryFee" | "order.edit" | "order.delete";

export function actorFrom(locals: Record<string, unknown>): Actor {
  const admin = locals.admin as { id?: unknown; name?: unknown } | undefined;
  return {
    id: typeof admin?.id === "string" ? admin.id : null,
    name: typeof admin?.name === "string" && admin.name ? admin.name : "Admin",
  };
}

/** The row to create inside the same transaction as the change it describes, so neither exists without the other. */
export function auditRow(actor: Actor, action: AuditAction, order: { id: string; orderNumber: string }, detail: unknown) {
  return {
    adminUserId: actor.id,
    adminName: actor.name,
    action,
    orderId: order.id,
    orderNumber: order.orderNumber,
    detail: JSON.stringify(detail),
  };
}

const MAX_ROWS = 200;

export async function listAudit(filter: { orderNumber?: string; limit?: number }) {
  const rows = await (prisma as any).adminAuditLog.findMany({
    where: filter.orderNumber ? { orderNumber: filter.orderNumber } : {},
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(filter.limit ?? 100, 1), MAX_ROWS),
    select: { id: true, adminName: true, action: true, orderNumber: true, detail: true, createdAt: true },
  });
  return rows.map((row: { detail: string }) => {
    let detail: unknown = null;
    try { detail = JSON.parse(row.detail); } catch { /* an unreadable detail is shown as empty, never as an error */ }
    return { ...row, detail };
  });
}
