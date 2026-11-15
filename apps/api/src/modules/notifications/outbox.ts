import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import { emailSettings, sendEmail, type EmailErrorCode } from "./email-provider.js";
import { renderOrderEmail, type NotificationEvent } from "./email-templates.js";

// A durable list of notifications to deliver. A row is written in the same transaction as the event that causes it
// (so an order never exists without its notification record), delivered right after, and retried later if that
// fails. Delivery never decides whether an order succeeds.
//
// Status: PENDING (waiting or to be retried) -> SENDING (claimed by one worker) -> SENT, or FAILED (given up).
// DISABLED means order emails were not set up when the event happened; nothing is sent unless an admin retries.
const db = prisma as any;

export const MAX_ATTEMPTS = 6;
// Wait before the 2nd, 3rd... attempt: 1 min, 5 min, 25 min, 2 h, 10 h.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 25 * 60_000, 2 * 3_600_000, 10 * 3_600_000];
// A row still marked SENDING after this long belongs to a worker that died; another worker may take it.
const STALE_CLAIM_MS = 2 * 60_000;

const ORDER_FOR_EMAIL = { items: true, deliveryLocation: true } as const;

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

type Outcome = "sent" | "retry" | "failed" | "skipped";

/** Tries to deliver one notification now. Safe to call from several places at once: only one caller sends. */
export async function deliverNotification(id: string, now = new Date()): Promise<Outcome> {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  const claimed = await db.notificationOutbox.updateMany({
    where: {
      id,
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: now } },
        { status: "SENDING", lastAttemptAt: { lte: staleBefore } },
      ],
    },
    data: { status: "SENDING", attempts: { increment: 1 }, lastAttemptAt: now },
  });
  if (claimed.count !== 1) return "skipped";

  const row = await db.notificationOutbox.findUnique({ where: { id }, include: { order: { include: ORDER_FOR_EMAIL } } });
  if (!row?.order) return "skipped";

  let code: EmailErrorCode | "RENDER_ERROR";
  let retryable: boolean;
  let detail: string | undefined;
  const settings = emailSettings();
  try {
    const email = renderOrderEmail(row.order, row.eventType as NotificationEvent);
    const recipient = settings?.recipient ?? row.recipient;
    const result = await sendEmail({ to: recipient, ...email, idempotencyKey: `qleaves-${row.dedupeKey}` });
    if (result.ok) {
      await db.notificationOutbox.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date(), recipient, lastErrorCode: null, providerMessageId: result.providerMessageId },
      });
      return "sent";
    }
    code = result.code;
    retryable = result.retryable;
    detail = result.detail;
  } catch {
    // A template or data problem: recorded as a code only. It will not fix itself, so it is not retried.
    code = "RENDER_ERROR";
    retryable = false;
  }

  const giveUp = !retryable || row.attempts >= MAX_ATTEMPTS;
  const delay = RETRY_DELAYS_MS[Math.min(row.attempts - 1, RETRY_DELAYS_MS.length - 1)];
  await db.notificationOutbox.update({
    where: { id },
    data: giveUp
      ? { status: "FAILED", lastErrorCode: code }
      : { status: "PENDING", lastErrorCode: code, nextAttemptAt: new Date(now.getTime() + delay) },
  });
  console.warn(JSON.stringify({ level: "warn", event: "notification-not-sent", notificationId: id, eventType: row.eventType, attempt: row.attempts, code, ...(detail ? { detail } : {}), final: giveUp }));
  return giveUp ? "failed" : "retry";
}

/** Delivers the notifications recorded for one order (used right after the order is saved). Never throws. */
export async function deliverForOrder(orderId: string): Promise<void> {
  try {
    const rows = await db.notificationOutbox.findMany({ where: { orderId, status: "PENDING" }, select: { id: true } });
    for (const row of rows) await deliverNotification(row.id);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "notification-delivery-error", name: error instanceof Error ? error.name : "unknown" }));
  }
}

/** Delivers notifications that are due, oldest first, within a time budget. Never throws. */
export async function processDueNotifications(options: { limit?: number; budgetMs?: number; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const deadline = Date.now() + (options.budgetMs ?? 20_000);
  const summary = { checked: 0, sent: 0, retry: 0, failed: 0 };
  try {
    const due = await db.notificationOutbox.findMany({
      where: {
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          { status: "SENDING", lastAttemptAt: { lte: new Date(now.getTime() - STALE_CLAIM_MS) } },
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
    console.error(JSON.stringify({ level: "error", event: "notification-worker-error", name: error instanceof Error ? error.name : "unknown" }));
  }
  return summary;
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

/** An admin asks for a notification to be sent again now. Starts a fresh set of attempts. */
export async function retryNotification(id: string) {
  const row = await db.notificationOutbox.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!row) throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  if (row.status === "SENT") throw new ApiError(409, "NOTIFICATION_ALREADY_SENT", "This email was already sent");
  if (!emailSettings()) throw new ApiError(409, "EMAIL_NOT_CONFIGURED", "Order emails are not set up on this server yet");
  const now = new Date();
  const reset = await db.notificationOutbox.updateMany({
    where: { id, status: { in: ["FAILED", "DISABLED", "PENDING"] } },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: now, lastErrorCode: null },
  });
  if (reset.count === 1) await deliverNotification(id, now);
  return db.notificationOutbox.findUnique({ where: { id }, select: PUBLIC_FIELDS });
}
