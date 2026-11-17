import { prisma } from "./prisma.js";

// The columns and tables that order safety depends on. If any is missing the database is behind the code (a migration
// was not applied before a release), and the API must say so instead of quietly taking orders without them.
const db = prisma as unknown as {
  order: { findFirst(args: unknown): Promise<unknown> };
  notificationOutbox: { findFirst(args: unknown): Promise<unknown> };
  adminAuditLog: { findFirst(args: unknown): Promise<unknown> };
};

export type SchemaState = "current" | "outdated";

/** True for Prisma's "table does not exist" (P2021) and "column does not exist" (P2022) errors. */
export function isMissingSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "P2021" || code === "P2022" || /does not exist in the current database|no such (table|column)/i.test(String(message ?? ""));
}

/** Reads one row's required fields from each table; a missing table or column means "outdated". Other errors throw. */
export async function requiredSchemaState(): Promise<SchemaState> {
  try {
    await Promise.all([
      db.order.findFirst({ select: { id: true, idempotencyKey: true, requestFingerprint: true } }),
      db.notificationOutbox.findFirst({ select: { id: true, dedupeKey: true, leaseExpiresAt: true } }),
      db.adminAuditLog.findFirst({ select: { id: true } }),
    ]);
    return "current";
  } catch (error) {
    if (isMissingSchema(error)) return "outdated";
    throw error;
  }
}
