// Sends the checkout submission and keeps sending it, with the same key and the same body, until QLeaves answers.
//
//   idle -> sending -> accepted                 (the server committed the order and returned its number)
//                   -> rejected                 (a definite answer that needs the customer: out of stock, bad field)
//                   -> confirming -> waiting    (no answer: timed out, dropped, server error, offline)
//
// "confirming" is the first half-minute of automatic retries; "waiting" follows, with slower retries while the
// page is open, on reconnection, when the page becomes visible again, and on the next visit. Only "accepted" means
// the shop has the order. Nothing here clears the cart or shows a confirmation before that.
import { create } from "zustand";
import { ApiClientError, errorFromResponse } from "../../lib/api-error";
import { useCartStore } from "../cart/cart-store";
import { rememberOrderSummary, type OrderSummary } from "./order-summary";
import {
  createPendingOrder, deletePendingOrder, loadPendingOrder, savePendingOrder,
  type OrderPayload, type PendingOrder, type SavedWhere,
} from "./pending-order";

export type SubmissionPhase = "idle" | "sending" | "confirming" | "waiting" | "accepted" | "rejected";

type PlacedOrderResponse = {
  orderNumber: string;
  subtotalQar: number;
  deliveryChargePending?: boolean;
  items: Array<{ productId: string; productName: string; quantity: number; unitPriceQar: number }>;
};

type SubmissionState = {
  phase: SubmissionPhase;
  order: PendingOrder | null;
  savedOn: SavedWhere | null;
  /** Set when the order is accepted: what the confirmation page shows. */
  accepted: OrderSummary | null;
  /** Set when the order is rejected: the server's answer, for a customer-facing message. */
  rejection: ApiClientError | null;
  /** When the next automatic attempt is due (ms since epoch), while confirming or waiting. */
  nextAttemptAt: number | null;
};

export const ORDER_URL = "/api/v1/orders";
export const ATTEMPT_TIMEOUT_MS = 20_000;
/** A first attempt still running after this is shown as "confirming", not just "sending". */
export const SLOW_FIRST_ATTEMPT_MS = 5_000;
/** Delays before automatic retries: a quick burst first (about half a minute), then slower while waiting. */
export const QUICK_RETRIES_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
export const SLOW_RETRIES_MS = [30_000, 60_000, 120_000];

export const useOrderSubmission = create<SubmissionState>(() => ({
  phase: "idle", order: null, savedOn: null, accepted: null, rejection: null, nextAttemptAt: null,
}));

let inFlight: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let slowTimer: ReturnType<typeof setTimeout> | null = null;
let retriesThisVisit = 0;

function set(partial: Partial<SubmissionState>) {
  useOrderSubmission.setState(partial);
}

function clearTimers() {
  if (retryTimer) clearTimeout(retryTimer);
  if (slowTimer) clearTimeout(slowTimer);
  retryTimer = null;
  slowTimer = null;
}

function jitter(ms: number): number {
  return Math.round(ms * (0.7 + Math.random() * 0.6));
}

type Outcome =
  | { kind: "accepted"; body: PlacedOrderResponse }
  | { kind: "rejected"; error: ApiClientError }
  | { kind: "retry"; retryAfterMs: number | null };

// Answers that settle the matter without the customer: these never become a "rejected" order.
function retryable(status: number, code: string | undefined): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500 && code !== "ORDERING_DISABLED";
}

async function attempt(order: PendingOrder): Promise<Outcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const response = await fetch(ORDER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": order.key },
      body: JSON.stringify(order.payload),
      signal: controller.signal,
    });
    if (response.ok) {
      const body = await response.json().catch(() => null) as PlacedOrderResponse | null;
      // A success without a readable order number is not proof of an order: ask again with the same key.
      if (!body || typeof body.orderNumber !== "string" || !Array.isArray(body.items)) return { kind: "retry", retryAfterMs: null };
      return { kind: "accepted", body };
    }
    const error = await errorFromResponse(response);
    if (retryable(response.status, error.code)) {
      const header = Number(response.headers.get("Retry-After"));
      return { kind: "retry", retryAfterMs: Number.isFinite(header) && header > 0 ? Math.min(header, 900) * 1000 : null };
    }
    return { kind: "rejected", error };
  } catch {
    // Offline, connection refused or reset, or our own time limit: the server may or may not have the order.
    return { kind: "retry", retryAfterMs: null };
  } finally {
    clearTimeout(timer);
  }
}

function summaryFrom(order: PendingOrder, body: PlacedOrderResponse): OrderSummary {
  return {
    orderNumber: body.orderNumber,
    items: body.items.map((item) => ({
      name: item.productName,
      nameAr: order.arabicNames[item.productId] ?? null,
      quantity: item.quantity,
      unitPriceQar: item.unitPriceQar,
    })),
    subtotalQar: body.subtotalQar,
    deliveryChargePending: body.deliveryChargePending === true,
  };
}

/** The cart is emptied only if it still holds exactly what was ordered; anything added since stays. */
function clearCartIfOrdered(order: PendingOrder) {
  const cart = useCartStore.getState();
  const ordered = new Map(order.payload.items.map((item) => [item.productId, item.quantity]));
  const same = cart.items.length === ordered.size && cart.items.every((item) => ordered.get(item.id) === item.quantity);
  if (same) cart.clear();
}

function schedule(outcomeDelay: number | null) {
  const quick = retriesThisVisit < QUICK_RETRIES_MS.length;
  const base = quick ? QUICK_RETRIES_MS[retriesThisVisit] : SLOW_RETRIES_MS[Math.min(retriesThisVisit - QUICK_RETRIES_MS.length, SLOW_RETRIES_MS.length - 1)];
  const delay = Math.max(outcomeDelay ?? 0, jitter(base));
  retriesThisVisit += 1;
  set({ phase: quick ? "confirming" : "waiting", nextAttemptAt: Date.now() + delay });
  retryTimer = setTimeout(() => { retryTimer = null; void run(); }, delay);
}

async function runOnce(): Promise<void> {
  const order = useOrderSubmission.getState().order;
  if (!order) return;
  clearTimers();
  if (useOrderSubmission.getState().phase === "idle") set({ phase: "sending" });
  // A first attempt that is taking a while is shown as "confirming": calm wording, still no second order possible.
  if (useOrderSubmission.getState().phase === "sending") {
    slowTimer = setTimeout(() => { if (useOrderSubmission.getState().phase === "sending") set({ phase: "confirming" }); }, SLOW_FIRST_ATTEMPT_MS);
  }

  const outcome = await attempt(order);
  if (slowTimer) clearTimeout(slowTimer);
  slowTimer = null;
  // The customer discarded it, or another call replaced it, while this attempt was out.
  if (useOrderSubmission.getState().order?.key !== order.key) return;

  if (outcome.kind === "accepted") {
    const summary = summaryFrom(order, outcome.body);
    rememberOrderSummary(summary);
    clearCartIfOrdered(order);
    await deletePendingOrder();
    set({ phase: "accepted", accepted: summary, order: null, savedOn: null, nextAttemptAt: null });
    return;
  }
  if (outcome.kind === "rejected") {
    // A definite "no" from the server: no order was created under this key, so the record is no longer needed.
    // The customer corrects the details and sends a new submission (with a new key).
    await deletePendingOrder();
    set({ phase: "rejected", rejection: outcome.error, order: null, savedOn: null, nextAttemptAt: null });
    return;
  }
  const updated = { ...order, attempts: order.attempts + 1, updatedAt: Date.now() };
  const savedOn = useOrderSubmission.getState().savedOn === "device" ? await savePendingOrder(updated) : "memory";
  set({ order: updated, savedOn });
  schedule(outcome.retryAfterMs);
}

function run(): Promise<void> {
  if (!inFlight) inFlight = runOnce().finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Starts a new submission. Returns false (and does nothing) while another one is unfinished, so a double tap or a
 * second tab press can never create a second order.
 */
export async function submitOrder(payload: OrderPayload, arabicNames: Record<string, string | null>): Promise<boolean> {
  const current = useOrderSubmission.getState();
  if (current.order || inFlight) return false;
  const order = await createPendingOrder(payload, arabicNames);
  if (useOrderSubmission.getState().order) return false;
  retriesThisVisit = 0;
  // Saved before the first byte is sent, so even a crash during the request leaves the key on the device.
  set({ phase: "sending", order, accepted: null, rejection: null, savedOn: null });
  const savedOn = await savePendingOrder(order);
  set({ savedOn });
  await run();
  return true;
}

/** Picks up an unfinished submission saved on this device (page load, reopened site) and resumes sending it. */
export async function resumePendingOrder(): Promise<void> {
  if (useOrderSubmission.getState().order || inFlight) return;
  const order = await loadPendingOrder();
  if (!order || useOrderSubmission.getState().order) return;
  retriesThisVisit = 0;
  set({ phase: "confirming", order, savedOn: "device", accepted: null, rejection: null });
  await run();
}

/** "Try again now": sends at once instead of waiting for the next scheduled attempt. */
export function retryNow(): Promise<void> {
  if (!useOrderSubmission.getState().order) return Promise.resolve();
  return run();
}

/**
 * The customer chooses to start over. The record is removed from this device; if the server had already received
 * the order, the shop still has it (the customer is told this before choosing).
 */
export async function discardPendingOrder(): Promise<void> {
  clearTimers();
  await deletePendingOrder();
  set({ phase: "idle", order: null, savedOn: null, accepted: null, rejection: null, nextAttemptAt: null });
}

/** After the confirmation (or the rejection) has been shown. */
export function acknowledgeSubmission(): void {
  if (useOrderSubmission.getState().order) return;
  set({ phase: "idle", accepted: null, rejection: null, nextAttemptAt: null });
}

// The connection came back, or the customer came back to the tab: try straight away instead of waiting.
if (typeof window !== "undefined") {
  const wake = () => {
    const { phase } = useOrderSubmission.getState();
    if ((phase === "confirming" || phase === "waiting") && !inFlight) void retryNow();
  };
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wake(); });
}

/** For tests: back to a fresh tab. */
export function resetOrderSubmissionForTests(): void {
  clearTimers();
  inFlight = null;
  retriesThisVisit = 0;
  set({ phase: "idle", order: null, savedOn: null, accepted: null, rejection: null, nextAttemptAt: null });
}
