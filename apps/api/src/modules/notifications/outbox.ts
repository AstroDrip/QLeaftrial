import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import { emailSettings, sendEmail } from "./email-provider.js";
import { renderOrderEmail, type NotificationEvent } from "./email-templates.js";
import { SheetsError } from "../sheets/google-auth.js";
import { qualifiesForSheet, recordSheetSync, sheetsConfig, syncOrder } from "../sheets/order-sheet.js";

// The outbox: work that must happen after an order or an order change is saved, kept in the database until it is done.
//   ORDER_CREATED (and the payment events): the shop's email about the order, sent once.
//   SHEET_SYNC: bring this order's row in the Google Sheet in line with the order as it is now. One row per order;
//     every relevant change sets it waiting again, and the worker always writes the order's current state, so changes
//     that arrive late, twice or out of order still end with the right row.
// A row is written in the same transaction as the change that needs it, so the change never exists without its job.
//
// Processing is at-least-once and every effect is idempotent: the email carries the same provider idempotency key on
// every attempt, and the sheet row is keyed by order number. A worker claims a row by setting a lease (status
// SENDING, leaseExpiresAt); the lease value is its claim token, and only the holder of the current lease may record
// the result. A lease that runs out means its worker stopped, and another worker takes the row.
//
// Status: PENDING -> SENDING -> SENT, or FAILED after the last attempt (or at once for a request that cannot work).
// DISABLED: the service (email, Google Sheets) was not set up; nothing is sent unless an admin asks.
const db = prisma as any;

export const MAX_ATTEMPTS = 6;
// Wait before the 2nd, 3rd... attempt: 1 min, 5 min, 25 min, 2 h, 10 h.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 25 * 60_000, 2 * 3_600_000, 10 * 3_600_000];
export const LEASE_MS = 2 * 60_000;
const SHEET_TIMEOUT_MS = 15_000;
const SHEET_EVENT = "SHEET_SYNC";

const ORDER_FOR_WORK = { items: true, deliveryLocation: true } as const;

/** Call inside the transaction that creates the event. The unique key makes a repeat of the same event a no-op. */
export async function recordNotification(tx: any, input: { orderId: string; eventType: NotificationEvent; dedupeKey: string }) {
  const settings = emailSettings();
  await tx.notificationOutbox.create({
    data: {
      dedupeKey: input.dedupeKey,
      orderId: input.orderId,
      eventType: input.eventType,
      recipient: settings?.recipient ?? "",
      status: settings ? "PENDING" : "DISABLED",
      // Stamped by this server, not by the database: the same clock later decides whether the row is due, so a
      // small difference between the two machines' clocks can never hold back the first send.
      nextAttemptAt: new Date(),
    },
  });
}

/**
 * Call inside the transaction of any change that can affect the order's sheet row (creation, status, payment,
 * delivery charge, edit). If a worker is writing the row right now, the new run waits until that lease ends, so two
 * workers never write the same order's row at the same time.
 */
export async function requestSheetSync(tx: any, orderId: string, now = new Date()) {
  const dedupeKey = `sheet-sync:${orderId}`;
  const status = sheetsConfig() ? "PENDING" : "DISABLED";
  const existing = await tx.notificationOutbox.findUnique({ where: { dedupeKey }, select: { status: true, leaseExpiresAt: true } });
  const busyUntil = existing?.status === "SENDING" && existing.leaseExpiresAt && existing.leaseExpiresAt > now ? existing.leaseExpiresAt : null;
  await tx.notificationOutbox.upsert({
    where: { dedupeKey },
    create: { dedupeKey, orderId, eventType: SHEET_EVENT, recipient: "", status, nextAttemptAt: now },
    // A new lease-less PENDING row: whatever a worker is still doing with the old state cannot be recorded over it.
    update: { status, attempts: 0, lastErrorCode: null, leaseExpiresAt: null, nextAttemptAt: busyUntil ?? now },
  });
}

type Outcome = "sent" | "retry" | "failed" | "skipped";
type Result = { ok: true; providerMessageId?: string | null } | { ok: false; code: string; retryable: boolean; detail?: string };

/** Claims the row for this worker. Returns the lease (its claim token), or null when another worker has it or it is not due. */
async function claim(id: string, now: Date): Promise<Date | null> {
  const lease = new Date(now.getTime() + LEASE_MS);
  const claimed = await db.notificationOutbox.updateMany({
    where: {
      id,
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: now } },
        { status: "SENDING", leaseExpiresAt: { lte: now } },
        // Rows claimed before leases existed: treat as expired once the lease time has passed.
        { status: "SENDING", leaseExpiresAt: null, lastAttemptAt: { lte: new Date(now.getTime() - LEASE_MS) } },
      ],
    },
    data: { status: "SENDING", attempts: { increment: 1 }, lastAttemptAt: now, leaseExpiresAt: lease },
  });
  return claimed.count === 1 ? lease : null;
}

/** Records the result, but only if this worker still holds the lease (nobody took the row over or re-queued it). */
async function finish(id: string, lease: Date, data: Record<string, unknown>): Promise<boolean> {
  const done = await db.notificationOutbox.updateMany({ where: { id, status: "SENDING", leaseExpiresAt: lease }, data: { ...data, leaseExpiresAt: null } });
  return done.count === 1;
}

async function sendOrderEmail(row: any): Promise<Result> {
  const settings = emailSettings();
  try {
    const email = renderOrderEmail(row.order, row.eventType as NotificationEvent);
    const recipient = settings?.recipient ?? row.recipient;
    const result = await sendEmail({ to: recipient, ...email, idempotencyKey: `qleaves-${row.dedupeKey}` });
    if (result.ok) return { ok: true, providerMessageId: result.providerMessageId };
    return { ok: false, code: result.code, retryable: result.retryable, detail: result.detail };
  } catch {
    // A template or data problem: recorded as a code only. It will not fix itself, so it is not retried.
    return { ok: false, code: "RENDER_ERROR", retryable: false };
  }
}

async function syncOrderRow(row: any): Promise<Result | "disabled"> {
  const config = sheetsConfig();
  if (!config) return "disabled";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SheetsError("SHEETS_TIMEOUT")), SHEET_TIMEOUT_MS); });
    const written = await Promise.race([syncOrder(row.order, config), limit]);
    if (written) await recordSheetSync([row.order.id], null);
    return { ok: true };
  } catch (error) {
    const code = error instanceof SheetsError ? error.code : "SHEETS_SYNC_FAILED";
    // Shown on the order in admin (with its retry button) only for orders that belong in the sheet.
    if (qualifiesForSheet(row.order) || row.order.status === "DELIVERED") await recordSheetSync([row.order.id], code);
    return { ok: false, code, retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Does one outbox job now, if it is due and no other worker holds it. Safe to call from several places at once. */
export async function deliverNotification(id: string, now = new Date()): Promise<Outcome> {
  const lease = await claim(id, now);
  if (!lease) return "skipped";

  const row = await db.notificationOutbox.findUnique({ where: { id }, include: { order: { include: ORDER_FOR_WORK } } });
  if (!row?.order) {
    await finish(id, lease, { status: "SENT", sentAt: new Date() });
    return "skipped";
  }

  const result = row.eventType === SHEET_EVENT ? await syncOrderRow(row) : await sendOrderEmail(row);
  if (result === "disabled") {
    await finish(id, lease, { status: "DISABLED" });
    return "skipped";
  }
  if (result.ok) {
    const recorded = await finish(id, lease, {
      status: "SENT", sentAt: new Date(), lastErrorCode: null,
      ...(row.eventType === SHEET_EVENT ? {} : { recipient: emailSettings()?.recipient ?? row.recipient, providerMessageId: result.providerMessageId ?? null }),
    });
    return recorded ? "sent" : "skipped";
  }

  const giveUp = !result.retryable || row.attempts >= MAX_ATTEMPTS;
  const delay = RETRY_DELAYS_MS[Math.min(row.attempts - 1, RETRY_DELAYS_MS.length - 1)];
  await finish(id, lease, giveUp
    ? { status: "FAILED", lastErrorCode: result.code }
    : { status: "PENDING", lastErrorCode: result.code, nextAttemptAt: new Date(now.getTime() + delay) });
  console.warn(JSON.stringify({ level: "warn", event: "outbox-job-not-done", jobId: id, eventType: row.eventType, attempt: row.attempts, code: result.code, ...(result.detail ? { detail: result.detail } : {}), final: giveUp }));
  return giveUp ? "failed" : "retry";
}

/** Does the due jobs, oldest first, within a time budget: all of them, or only one order's. Never throws. */
export async function processOutbox(options: { limit?: number; budgetMs?: number; now?: Date; orderId?: string } = {}) {
  const now = options.now ?? new Date();
  const deadline = Date.now() + (options.budgetMs ?? 20_000);
  const summary = { checked: 0, sent: 0, retry: 0, failed: 0 };
  try {
    const due = await db.notificationOutbox.findMany({
      where: {
        ...(options.orderId ? { orderId: options.orderId } : {}),
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          { status: "SENDING", leaseExpiresAt: { lte: now } },
          { status: "SENDING", leaseExpiresAt: null, lastAttemptAt: { lte: new Date(now.getTime() - LEASE_MS) } },
        ],
      },
      orderBy: { nextAttemptAt: "asc" },
      take: options.limit ?? 10,
      select: { id: true },
    });
    for (const row of due) {
      if (Date.now() >= deadline) break;
      const outcome = await deliverNotification(row.id, now);
      summary.checked += 1;
      if (outcome !== "skipped") summary[outcome] += 1;
    }
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "outbox-worker-error", name: error instanceof Error ? error.name : "unknown" }));
  }
  return summary;
}

/** Earlier name, kept for the worker endpoint and tests. */
export const processDueNotifications = processOutbox;

/** Does the jobs recorded for one order (right after it was saved or changed). Never throws. */
export async function deliverForOrder(orderId: string): Promise<void> {
  await processOutbox({ orderId, limit: 5, budgetMs: 20_000 });
}

const PUBLIC_FIELDS = {
  id: true, orderId: true, eventType: true, recipient: true, status: true, attempts: true, lastAttemptAt: true,
  nextAttemptAt: true, lastErrorCode: true, sentAt: true, createdAt: true,
} as const;

export async function listNotifications(filter: { status?: string; limit?: number }) {
  return db.notificationOutbox.findMany({
    where: filter.status ? { status: filter.status } : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(filter.limit ?? 50, 1), 200),
    select: { ...PUBLIC_FIELDS, order: { select: { orderNumber: true } } },
  });
}

/** An admin asks for a job to be done again now. Starts a fresh set of attempts. */
export async function retryNotification(id: string) {
  const row = await db.notificationOutbox.findUnique({ where: { id }, select: { id: true, status: true, eventType: true } });
  if (!row) throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  if (row.status === "SENT") throw new ApiError(409, "NOTIFICATION_ALREADY_SENT", "This email was already sent");
  const sheet = row.eventType === SHEET_EVENT;
  if (sheet ? !sheetsConfig() : !emailSettings()) {
    throw new ApiError(409, sheet ? "SHEETS_NOT_CONFIGURED" : "EMAIL_NOT_CONFIGURED", sheet ? "Google Sheets is not set up yet" : "Order emails are not set up on this server yet");
  }
  const now = new Date();
  const reset = await db.notificationOutbox.updateMany({
    where: { id, status: { in: ["FAILED", "DISABLED", "PENDING"] } },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: now, lastErrorCode: null, leaseExpiresAt: null },
  });
  if (reset.count === 1) await deliverNotification(id, now);
  return db.notificationOutbox.findUnique({ where: { id }, select: PUBLIC_FIELDS });
}

/** After an admin's direct sheet sync (the per-order retry button) succeeded: nothing is left for the worker. */
export async function markSheetSynced(orderId: string): Promise<void> {
  await db.notificationOutbox.updateMany({
    where: { dedupeKey: `sheet-sync:${orderId}`, status: { in: ["PENDING", "FAILED", "DISABLED"] } },
    data: { status: "SENT", sentAt: new Date(), lastErrorCode: null, leaseExpiresAt: null },
  });
}
