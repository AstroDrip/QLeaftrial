// The checkout submission kept on this device until QLeaves confirms it. It is written before the order is first
// sent, so a refresh, a closed tab or a dropped connection cannot lose it or its idempotency key: the same key is
// sent again until the server answers, and the server returns the order it already saved instead of a second one.
//
// This is a recovery aid, not the shop's record: an order exists only once the server has committed it. Browser
// storage can be cleared or evicted, so the customer is never told the order was received because it is saved here.
// Only what the order needs is kept (no card data), and it is deleted as soon as the order is confirmed, rejected,
// discarded by the customer, or after RETENTION_MS.
import { idbDelete, idbGet, idbSet } from "../../lib/idb";

export const PENDING_DATABASE = "qleaves-orders";
const PENDING_STORE = "pending";
const PENDING_RECORD = "current";
export const PENDING_LOCAL_KEY = "qleaves-pending-order";
export const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export type OrderPayload = Record<string, unknown> & { items: Array<{ productId: string; quantity: number }> };

export type PendingOrder = {
  version: 1;
  /** Sent as Idempotency-Key on every attempt; never replaced for this submission. */
  key: string;
  /** The exact request body, sent unchanged on every attempt. */
  payload: OrderPayload;
  /** SHA-256 of the payload: a record whose payload no longer matches is damaged and is never sent. */
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  /** For the confirmation page only: the Arabic product names the customer saw. */
  arabicNames: Record<string, string | null>;
};

/** Where the record ended up: on the device (survives a refresh), or only in this tab's memory. */
export type SavedWhere = "device" | "memory";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function fingerprintOf(payload: unknown): Promise<string> {
  const text = canonical(payload);
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    // No Web Crypto (very old browsers, insecure origins): a simple 64-bit FNV-1a hash, enough to detect damage.
    let hash = 0xcbf29ce484222325n;
    for (const char of text) hash = BigInt.asUintN(64, (hash ^ BigInt(char.codePointAt(0)!)) * 0x100000001b3n);
    return `fnv-${hash.toString(16)}`;
  }
}

export function newIdempotencyKey(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `checkout-${random}`;
}

export async function createPendingOrder(payload: OrderPayload, arabicNames: Record<string, string | null>, now = Date.now()): Promise<PendingOrder> {
  return { version: 1, key: newIdempotencyKey(), payload, fingerprint: await fingerprintOf(payload), createdAt: now, updatedAt: now, attempts: 0, arabicNames };
}

function shaped(value: unknown): value is PendingOrder {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PendingOrder>;
  return record.version === 1 && typeof record.key === "string" && /^[A-Za-z0-9_-]{16,80}$/.test(record.key) &&
    typeof record.fingerprint === "string" && typeof record.createdAt === "number" && typeof record.attempts === "number" &&
    Boolean(record.payload) && Array.isArray(record.payload?.items) && record.payload!.items.length > 0;
}

/** Asks the browser not to evict this site's storage under pressure. A request, not a guarantee. */
let persistenceRequested = false;
function requestPersistence(): void {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // Not supported: nothing to do.
  }
}

/** Saves the record. IndexedDB first; if that is unavailable, localStorage; otherwise it lives in memory only. */
export async function savePendingOrder(record: PendingOrder): Promise<SavedWhere> {
  requestPersistence();
  try {
    await idbSet(PENDING_DATABASE, PENDING_STORE, PENDING_RECORD, record);
    return "device";
  } catch {
    try {
      window.localStorage.setItem(PENDING_LOCAL_KEY, JSON.stringify(record));
      return "device";
    } catch {
      return "memory";
    }
  }
}

async function checked(value: unknown, now: number): Promise<PendingOrder | null> {
  if (!shaped(value)) return null;
  if (now - value.createdAt > RETENTION_MS) return null;
  return (await fingerprintOf(value.payload)) === value.fingerprint ? value : null;
}

/** The unfinished submission saved on this device, if any. Expired or damaged records are deleted, never sent. */
export async function loadPendingOrder(now = Date.now()): Promise<PendingOrder | null> {
  let fromIdb: unknown = null;
  let fromLocal: unknown = null;
  try { fromIdb = await idbGet(PENDING_DATABASE, PENDING_STORE, PENDING_RECORD); } catch { /* unavailable */ }
  try { fromLocal = JSON.parse(window.localStorage.getItem(PENDING_LOCAL_KEY) ?? "null"); } catch { /* unavailable or damaged */ }
  const candidates = (await Promise.all([fromIdb, fromLocal].map((value) => checked(value, now)))).filter((value): value is PendingOrder => Boolean(value));
  if (!candidates.length) {
    if (fromIdb || fromLocal) await deletePendingOrder();
    return null;
  }
  // Both stores can hold a copy only if IndexedDB failed once and worked later; the most recently updated wins.
  return candidates.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

export async function deletePendingOrder(): Promise<void> {
  try { await idbDelete(PENDING_DATABASE, PENDING_STORE, PENDING_RECORD); } catch { /* unavailable */ }
  try { window.localStorage.removeItem(PENDING_LOCAL_KEY); } catch { /* unavailable */ }
}
