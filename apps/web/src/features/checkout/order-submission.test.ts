import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { idbGet, resetIdbForTests } from "../../lib/idb";
import { useCartStore } from "../cart/cart-store";
import {
  QUICK_RETRIES_MS, discardPendingOrder, resetOrderSubmissionForTests, resumePendingOrder, retryNow, submitOrder, useOrderSubmission,
} from "./order-submission";
import { PENDING_DATABASE, PENDING_LOCAL_KEY, RETENTION_MS, createPendingOrder, loadPendingOrder, savePendingOrder, type OrderPayload, type PendingOrder } from "./pending-order";

// The order submission must survive refreshes, dropped answers and outages without ever placing a second order,
// and must never be shown as received before the server says so.
const payload: OrderPayload = {
  customerName: "Test Customer", phone: "+97455550000", email: "", addressLine1: "Building 4, Street 820, Zone 38",
  area: "Doha", deliveryNotes: "", paymentMethod: "COD", items: [{ productId: "plant-1", quantity: 2 }],
};
const names = { "plant-1": "نبتة" };
const placed = { orderNumber: "QL-20261117-ABC123", subtotalQar: 240, deliveryChargePending: false, items: [{ productId: "plant-1", productName: "Plant", quantity: 2, unitPriceQar: 120 }] };
const ok = (body: unknown = placed) => ({ ok: true, status: 201, headers: new Headers(), json: async () => body } as unknown as Response);
const fail = (status: number, code: string, headers: Record<string, string> = {}) =>
  ({ ok: false, status, headers: new Headers(headers), json: async () => ({ error: { code, message: `server says ${code}`, requestId: "req_secret" } }) } as unknown as Response);
const dropped = (_url?: unknown, _init?: unknown): Promise<Response> => Promise.reject(new TypeError("Failed to fetch"));
const sentKeys = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers["Idempotency-Key"]);
const storedRecord = () => idbGet<PendingOrder>(PENDING_DATABASE, "pending", "current");
const cartItem = { id: "plant-1", slug: "plant", name: "Plant", priceQar: 120, stock: 9, image: null, quantity: 2 };

/** A brand-new tab on the same device: nothing in memory, the device's storage kept. */
function newTab() {
  resetOrderSubmissionForTests();
  resetIdbForTests();
}

describe("order submission", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    resetIdbForTests();
    resetOrderSubmissionForTests();
    localStorage.clear();
    useCartStore.setState({ items: [cartItem] });
  });
  afterEach(() => {
    resetOrderSubmissionForTests();
    resetIdbForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("saves the order on the device before sending it, and confirms only on the server's answer", async () => {
    let savedWhenSent: PendingOrder | undefined;
    const fetchMock = vi.fn(async () => { savedWhenSent = await storedRecord(); return ok(); });
    vi.stubGlobal("fetch", fetchMock);
    expect(await submitOrder(payload, names)).toBe(true);

    expect(savedWhenSent?.payload).toEqual(payload);
    expect(sentKeys(fetchMock)).toEqual([savedWhenSent?.key]);
    const state = useOrderSubmission.getState();
    expect(state.phase).toBe("accepted");
    expect(state.accepted).toEqual({ orderNumber: placed.orderNumber, subtotalQar: 240, deliveryChargePending: false, items: [{ name: "Plant", nameAr: "نبتة", quantity: 2, unitPriceQar: 120 }] });
    // Confirmed: the copy on the device and the cart are cleared.
    expect(await storedRecord()).toBeUndefined();
    expect(useCartStore.getState().items).toEqual([]);
  });

  it("recovers the same order after a refresh during sending, with the same key and body", async () => {
    const firstTab = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", firstTab);
    void submitOrder(payload, names);
    await vi.waitFor(() => expect(firstTab).toHaveBeenCalledTimes(1));
    // The page is reloaded while the request is out: everything in memory is gone.
    newTab();
    expect(useOrderSubmission.getState().phase).toBe("idle");

    const secondTab = vi.fn(async (_url: string, _init?: RequestInit) => ok());
    vi.stubGlobal("fetch", secondTab);
    await resumePendingOrder();
    expect(sentKeys(secondTab)).toEqual(sentKeys(firstTab));
    expect(secondTab.mock.calls[0][1]).toMatchObject({ body: firstTab.mock.calls[0][1]?.body });
    expect(useOrderSubmission.getState()).toMatchObject({ phase: "accepted", accepted: { orderNumber: placed.orderNumber } });
    expect(await loadPendingOrder()).toBeNull();
  });

  it("keeps trying by itself after a dropped answer: confirming first, then waiting, always the same key", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.stubGlobal("indexedDB", undefined); // localStorage only, so no IndexedDB timers in this test
    resetIdbForTests();
    const fetchMock = vi.fn(dropped);
    vi.stubGlobal("fetch", fetchMock);
    await submitOrder(payload, names);
    expect(useOrderSubmission.getState()).toMatchObject({ phase: "confirming", savedOn: "device" });

    for (let index = 0; index < QUICK_RETRIES_MS.length; index += 1) await vi.advanceTimersByTimeAsync(QUICK_RETRIES_MS[index] * 1.3 + 10);
    expect(fetchMock).toHaveBeenCalledTimes(QUICK_RETRIES_MS.length + 1);
    expect(useOrderSubmission.getState().phase).toBe("waiting");
    expect(new Set(sentKeys(fetchMock)).size).toBe(1);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(PENDING_LOCAL_KEY)!).attempts).toBe(QUICK_RETRIES_MS.length + 1);

    // The server is back: the next attempt (or "Try again now") recovers the order.
    fetchMock.mockImplementation(async () => ok());
    await retryNow();
    expect(useOrderSubmission.getState().phase).toBe("accepted");
    expect(new Set(sentKeys(fetchMock)).size).toBe(1);
    expect(localStorage.getItem(PENDING_LOCAL_KEY)).toBeNull();
  });

  it("waits as long as the server asks when it is busy", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.stubGlobal("indexedDB", undefined);
    resetIdbForTests();
    const fetchMock = vi.fn(async () => fail(429, "TOO_MANY_ORDER_ATTEMPTS", { "Retry-After": "90" }));
    vi.stubGlobal("fetch", fetchMock);
    await submitOrder(payload, names);
    expect(useOrderSubmission.getState().phase).toBe("confirming");
    await vi.advanceTimersByTimeAsync(80_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a server error as unknown, never as a rejection, and never shows its details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(503, "DATABASE_UNAVAILABLE")));
    await submitOrder(payload, names);
    const state = useOrderSubmission.getState();
    expect(state.phase).toBe("confirming");
    expect(state.rejection).toBeNull();
    expect(await loadPendingOrder()).not.toBeNull();
  });

  it("passes a definite refusal to the customer, keeps the cart, and forgets the saved copy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail(409, "INSUFFICIENT_STOCK")));
    await submitOrder(payload, names);
    const state = useOrderSubmission.getState();
    expect(state.phase).toBe("rejected");
    expect(state.rejection?.code).toBe("INSUFFICIENT_STOCK");
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(await loadPendingOrder()).toBeNull();
  });

  it("does not accept a success answer without an order number", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ hello: "world" })));
    await submitOrder(payload, names);
    expect(useOrderSubmission.getState().phase).toBe("confirming");
  });

  it("sends nothing for a second press while the first order is unfinished", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    void submitOrder(payload, names);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await submitOrder({ ...payload, customerName: "Someone else" }, names)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves items added after the order in the cart", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok()));
    useCartStore.setState({ items: [cartItem, { ...cartItem, id: "pot-1", slug: "pot", name: "Pot", quantity: 1 }] });
    await submitOrder(payload, names);
    expect(useOrderSubmission.getState().phase).toBe("accepted");
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it("never sends a damaged or expired saved copy, and deletes it", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    const record = await createPendingOrder(payload, names);
    await savePendingOrder({ ...record, payload: { ...payload, items: [{ productId: "plant-1", quantity: 20 }] } });
    await resumePendingOrder();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await storedRecord()).toBeUndefined();

    await savePendingOrder({ ...record, createdAt: Date.now() - RETENTION_MS - 1 });
    newTab();
    await resumePendingOrder();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await storedRecord()).toBeUndefined();
  });

  it("falls back to localStorage without IndexedDB, and to memory only (said honestly) without either", async () => {
    vi.stubGlobal("indexedDB", undefined);
    resetIdbForTests();
    vi.stubGlobal("fetch", vi.fn(dropped));
    await submitOrder(payload, names);
    expect(useOrderSubmission.getState().savedOn).toBe("device");
    expect(JSON.parse(localStorage.getItem(PENDING_LOCAL_KEY)!).payload).toEqual(payload);

    await discardPendingOrder();
    expect(localStorage.getItem(PENDING_LOCAL_KEY)).toBeNull();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded", "QuotaExceededError"); });
    try {
      await submitOrder(payload, names);
      expect(useOrderSubmission.getState()).toMatchObject({ phase: "confirming", savedOn: "memory" });
    } finally {
      setItem.mockRestore();
    }
  });

  it("lets the customer start over, which removes the saved copy", async () => {
    vi.stubGlobal("fetch", vi.fn(dropped));
    await submitOrder(payload, names);
    expect(await loadPendingOrder()).not.toBeNull();
    await discardPendingOrder();
    expect(useOrderSubmission.getState().phase).toBe("idle");
    expect(await loadPendingOrder()).toBeNull();
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
