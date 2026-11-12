import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { getAccessToken, normalizePrivateKey, resetGoogleTokenCache, signServiceAccountJwt } from "../src/modules/sheets/google-auth";
import { mirrorOrderToSheet, orderToRow, resetSheetPreparation, SHEET_HEADER, sheetsConfig, syncAllOrders, syncOrder, type SheetOrder } from "../src/modules/sheets/order-sheet";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const SERVICE_EMAIL = "orders@qleaves-test.iam.gserviceaccount.com";

type Cell = string | number;
type Call = { method: string; path: string; body?: Record<string, unknown> };

// A minimal in-memory Google Sheets: tabs, a header row and rows, behaving like the real API for the calls we make.
function fakeGoogle(options: { sheetsStatus?: number; tokenStatus?: number } = {}) {
  const state = { tabs: ["Sheet1"], rows: [] as Cell[][], calls: [] as Call[], tokenRequests: 0 };
  const tabId = (title: string) => state.tabs.indexOf(title) + 100;
  const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "oauth2.googleapis.com") {
      state.tokenRequests += 1;
      return options.tokenStatus ? respond(options.tokenStatus, { error: "invalid_grant" }) : respond(200, { access_token: "test-token", expires_in: 3600 });
    }
    const method = init?.method ?? "GET";
    const path = decodeURIComponent(url.pathname.replace(/^\/v4\/spreadsheets\/[^/:]+/, "")) + url.search;
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    state.calls.push({ method, path, body });
    if ((init?.headers as Record<string, string>).Authorization !== "Bearer test-token") return respond(401, {});
    if (options.sheetsStatus) return respond(options.sheetsStatus, { error: { message: "customer data would be here" } });

    const cells = /!([A-Z]+\d*:?[A-Z]*\d*)/.exec(path)?.[1] ?? "";
    if (method === "GET" && path.startsWith("?fields=")) return respond(200, { sheets: state.tabs.map((title) => ({ properties: { title, sheetId: tabId(title) } })) });
    if (method === "POST" && path === ":batchUpdate") {
      const requests = (body as { requests: Array<{ addSheet?: { properties: { title: string } }; deleteDimension?: { range: { sheetId: number; startIndex: number } } }> }).requests;
      if (requests[0].addSheet) { state.tabs.push(requests[0].addSheet.properties.title); return respond(200, { replies: [{ addSheet: { properties: { sheetId: tabId(requests[0].addSheet.properties.title) } } }] }); }
      for (const request of requests) { if (request.deleteDimension!.range.sheetId !== tabId("Orders")) return respond(400, {}); state.rows.splice(request.deleteDimension!.range.startIndex, 1); }
      return respond(200, {});
    }
    if (method === "POST" && path.includes(":clear")) { state.rows = []; return respond(200, {}); }
    if (method === "POST" && path === "/values:batchUpdate") {
      for (const entry of (body as { data: Array<{ range: string; values: Cell[][] }> }).data) state.rows[Number(/!A(\d+):/.exec(entry.range)![1]) - 1] = entry.values[0];
      return respond(200, {});
    }
    if (method === "GET" && cells === "A:Z") return respond(200, state.rows.length ? { values: state.rows } : {});
    if (method === "GET" && cells === "B:B") return respond(200, state.rows.length ? { values: state.rows.map((row) => [row[1]]) } : {});
    if (method === "PUT") { const start = Number(/!A(\d+):/.exec(path)![1]) - 1; (body as { values: Cell[][] }).values.forEach((values, offset) => { state.rows[start + offset] = values; }); return respond(200, {}); }
    if (method === "POST" && path.includes(":append")) { state.rows.push(...(body as { values: Cell[][] }).values); return respond(200, {}); }
    return respond(404, {});
  });
  return { state, fetchMock };
}

function sheetOrder(overrides: Partial<SheetOrder> = {}): SheetOrder {
  return {
    orderNumber: "QL-20261028-AAA111", createdAt: "2026-10-27T22:30:00Z", customerName: "Aisha Al-Mansoori", phone: "+974 5555 1234", area: "Doha",
    addressLine1: "Villa 12, Street 30", deliveryNotes: null, paymentMethod: "COD", paymentStatus: "PAID", status: "DELIVERED", subtotalQar: 245, deliveryFeeQar: 0,
    items: [{ productName: "Areca Palm", quantity: 2 }, { productName: "Orchid", quantity: 1 }], ...overrides,
  };
}

const ENV_KEYS = ["GOOGLE_SHEETS_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_SHEETS_TAB"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function configureSheets() {
  process.env.GOOGLE_SHEETS_ID = "sheet-id";
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = SERVICE_EMAIL;
  process.env.GOOGLE_PRIVATE_KEY = privateKey.replace(/\n/g, "\\n");
}

describe("Google Sheets order sync", () => {
  beforeEach(() => { resetGoogleTokenCache(); resetSheetPreparation(); });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
  });

  describe("configuration and sign-in", () => {
    it("is off unless the id, service account and key are all set, and unescapes the key", () => {
      expect(sheetsConfig({})).toBeNull();
      expect(sheetsConfig({ GOOGLE_SHEETS_ID: "id", GOOGLE_SERVICE_ACCOUNT_EMAIL: "a@b.c" } as NodeJS.ProcessEnv)).toBeNull();
      const config = sheetsConfig({ GOOGLE_SHEETS_ID: "id", GOOGLE_SERVICE_ACCOUNT_EMAIL: "a@b.c", GOOGLE_PRIVATE_KEY: '"line1\\nline2"' } as NodeJS.ProcessEnv)!;
      expect(config.account.privateKey).toBe("line1\nline2");
      expect(config.tab).toBe("Orders");
      expect(normalizePrivateKey(privateKey.replace(/\n/g, "\\n"))).toBe(privateKey);
    });

    it("signs a verifiable RS256 token for the service account", () => {
      const jwt = signServiceAccountJwt({ email: SERVICE_EMAIL, privateKey }, Date.UTC(2026, 9, 28));
      const [header, claims, signature] = jwt.split(".");
      expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
      expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toMatchObject({ iss: SERVICE_EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token" });
      expect(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(createPublicKey(publicKey), Buffer.from(signature, "base64url"))).toBe(true);
    });

    it("reuses the access token until shortly before it expires", async () => {
      const { state, fetchMock } = fakeGoogle();
      vi.stubGlobal("fetch", fetchMock);
      const account = { email: SERVICE_EMAIL, privateKey };
      const start = Date.now();
      await getAccessToken(account, start);
      await getAccessToken(account, start + 30 * 60_000);
      expect(state.tokenRequests).toBe(1);
      await getAccessToken(account, start + 3600_000);
      expect(state.tokenRequests).toBe(2);
    });
  });

  describe("rows", () => {
    it("builds a tidy row in Qatar time with the total and invoice number, and without the email", () => {
      expect(SHEET_HEADER).toEqual(["Date (Qatar)", "Order no.", "Invoice no.", "Customer", "Phone", "Area", "Address", "Items", "Delivery (QAR)", "Total (QAR)", "Payment method"]);
      const row = orderToRow(sheetOrder());
      expect(row).toHaveLength(SHEET_HEADER.length);
      expect(row).toEqual(["2026-10-28 01:30", "QL-20261028-AAA111", "INV-QL-20261028-AAA111", "Aisha Al-Mansoori", "+974 5555 1234", "Doha", "Villa 12, Street 30", "Areca Palm × 2; Orchid × 1", 0, 245, "Cash on delivery"]);
    });
  });

  describe("delivery charge columns", () => {
    it("puts the delivery charge in its own column and in the total", () => {
      const row = orderToRow(sheetOrder({ subtotalQar: 120, deliveryFeeQar: 15 }));
      expect(row[8]).toBe(15);
      expect(row[9]).toBe(135);
    });

    it("moves rows written in an earlier layout into the new columns, keeping every order and adding no duplicate", async () => {
      configureSheets();
      const { state, fetchMock } = fakeGoogle();
      state.tabs.push("Orders");
      const old = ["Order no.", "Invoice no.", "Date (Qatar)", "Customer", "Phone", "Area", "Address", "Items", "Subtotal (QAR)", "Total (QAR)", "Payment method", "Payment status", "Order status", "Delivery notes", "Updated (Qatar)", "Delivery (QAR)", "Delivery charge"];
      state.rows.push(old, ["QL-20261028-AAA111", "INV-QL-20261028-AAA111", "2026-10-28 01:30", "Aisha", "+974 1", "Doha", "Villa 12", "Areca Palm × 2", 245, 245, "Cash on delivery", "Paid", "Completed", "", "2026-10-28 13:05", 0, "Free"]);
      vi.stubGlobal("fetch", fetchMock);
      await syncOrder(sheetOrder(), sheetsConfig()!);
      expect(state.rows[0]).toEqual(SHEET_HEADER);
      expect(state.rows).toHaveLength(2);
      expect(state.rows[1].slice(0, 3)).toEqual(["2026-10-28 01:30", "QL-20261028-AAA111", "INV-QL-20261028-AAA111"]);
    });
  });

  describe("syncing", () => {
    it("creates the tab and header, appends a new order, then updates the same row in place", async () => {
      configureSheets();
      const { state, fetchMock } = fakeGoogle();
      vi.stubGlobal("fetch", fetchMock);
      const config = sheetsConfig()!;

      await syncOrder(sheetOrder(), config);
      expect(state.tabs).toContain("Orders");
      expect(state.rows).toHaveLength(2);
      expect(state.rows[0]).toEqual(SHEET_HEADER);

      // Syncing the same order again updates its row in place, never duplicates it.
      await syncOrder(sheetOrder({ customerName: "Aisha M." }), config);
      expect(state.rows).toHaveLength(2);
      expect(state.rows[1][3]).toBe("Aisha M.");

      await syncOrder(sheetOrder({ orderNumber: "QL-20261028-BBB222" }), config);
      expect(state.rows.map((row) => row[1])).toEqual(["Order no.", "QL-20261028-AAA111", "QL-20261028-BBB222"]);

      // A completed order later marked unpaid is no longer a finished sale: its row is removed.
      await syncOrder(sheetOrder({ paymentStatus: "PENDING" }), config);
      expect(state.rows.map((row) => row[1])).toEqual(["Order no.", "QL-20261028-BBB222"]);
      expect(state.tokenRequests).toBe(1);
    });

    it("only writes orders that are both completed and paid", async () => {
      configureSheets();
      const { state, fetchMock } = fakeGoogle();
      vi.stubGlobal("fetch", fetchMock);
      const config = sheetsConfig()!;

      await syncOrder(sheetOrder({ status: "PENDING", paymentStatus: "PENDING" }), config);
      await syncOrder(sheetOrder({ status: "CONFIRMED", paymentStatus: "PAID" }), config);
      expect(fetchMock).not.toHaveBeenCalled();

      await syncOrder(sheetOrder({ paymentStatus: "PENDING" }), config);
      expect(state.rows.slice(1)).toEqual([]);

      await syncOrder(sheetOrder(), config);
      expect(state.rows).toHaveLength(2);
    });

    it("writes values as plain text so a hostile customer name cannot become a formula", async () => {
      configureSheets();
      const { state, fetchMock } = fakeGoogle();
      vi.stubGlobal("fetch", fetchMock);

      await syncOrder(sheetOrder({ customerName: '=HYPERLINK("http://evil.example","pay here")' }), sheetsConfig()!);

      const writes = state.calls.filter((call) => call.method !== "GET" && call.path.includes("/values"));
      expect(writes.length).toBeGreaterThan(0);
      for (const write of writes) expect(write.path).toContain("valueInputOption=RAW");
      expect(state.rows[1][3]).toBe('=HYPERLINK("http://evil.example","pay here")');
    });

    it("syncs everything without deleting rows the shop no longer has", async () => {
      configureSheets();
      const { state, fetchMock } = fakeGoogle();
      vi.stubGlobal("fetch", fetchMock);
      const config = sheetsConfig()!;
      await syncOrder(sheetOrder({ orderNumber: "QL-OLD" }), config);

      const count = await syncAllOrders([
        sheetOrder({ orderNumber: "QL-NEW-1" }),
        sheetOrder({ orderNumber: "QL-NEW-2" }),
        sheetOrder({ orderNumber: "QL-NOT-DONE", status: "CONFIRMED" }),
        sheetOrder({ orderNumber: "QL-NOT-PAID", paymentStatus: "PENDING" }),
        sheetOrder({ orderNumber: "QL-OLD", paymentStatus: "PENDING" }),
      ], config);

      // QL-OLD is no longer paid, so its row goes; the two new completed, paid orders are added.
      expect(count).toBe(3);
      expect(state.rows.map((row) => row[1])).toEqual(["Order no.", "QL-NEW-1", "QL-NEW-2"]);
    });
  });

  describe("failure handling", () => {
    it("never throws or logs customer details when Google is down", async () => {
      configureSheets();
      const { fetchMock } = fakeGoogle({ sheetsStatus: 500 });
      vi.stubGlobal("fetch", fetchMock);
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(mirrorOrderToSheet(sheetOrder())).resolves.toBeUndefined();

      const logged = log.mock.calls.map((call) => String(call[0])).join("\n");
      expect(logged).toContain("sheet-sync-failed");
      expect(logged).not.toContain("Aisha");
      expect(logged).not.toContain("customer data would be here");
    });

    it("does nothing at all when Google Sheets is not configured", async () => {
      for (const key of ENV_KEYS) delete process.env[key];
      const { fetchMock } = fakeGoogle();
      vi.stubGlobal("fetch", fetchMock);

      await mirrorOrderToSheet(sheetOrder());

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

describe("Google Sheets in the API", () => {
  beforeEach(async () => { resetGoogleTokenCache(); resetSheetPreparation(); await resetDatabase(); });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
  });
  afterAll(() => prisma.$disconnect());

  async function placeOrder() {
    const product = await seededProduct("house-plant");
    return request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
  }

  it("adds the order to the sheet only once it is completed and paid, and corrects it if payment is undone", async () => {
    configureSheets();
    const { state, fetchMock } = fakeGoogle();
    vi.stubGlobal("fetch", fetchMock);

    const created = await placeOrder();
    expect(created.status).toBe(201);
    const agent = await loggedInAgent();
    await agent.patch(`/api/v1/admin/orders/${created.body.id}/status`).send({ status: "CONFIRMED" }).expect(200);
    await agent.patch(`/api/v1/admin/orders/${created.body.id}/payment`).send({ paymentStatus: "PAID" }).expect(200);
    expect(state.rows).toHaveLength(0);

    await agent.patch(`/api/v1/admin/orders/${created.body.id}/status`).send({ status: "DELIVERED" }).expect(200);
    expect(state.rows).toHaveLength(2);
    expect(state.rows[1][1]).toBe(created.body.orderNumber);

    await agent.patch(`/api/v1/admin/orders/${created.body.id}/payment`).send({ paymentStatus: "PENDING" }).expect(200);
    expect(state.rows).toHaveLength(1);
  });

  it("still saves the change when Google is failing", async () => {
    configureSheets();
    vi.stubGlobal("fetch", fakeGoogle({ tokenStatus: 500 }).fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const created = await placeOrder();
    const agent = await loggedInAgent();
    await agent.patch(`/api/v1/admin/orders/${created.body.id}/payment`).send({ paymentStatus: "PAID" }).expect(200);
    await agent.patch(`/api/v1/admin/orders/${created.body.id}/status`).send({ status: "CONFIRMED" }).expect(200);
    await agent.patch(`/api/v1/admin/orders/${created.body.id}/status`).send({ status: "DELIVERED" }).expect(200);

    expect(await prisma.order.findUnique({ where: { id: created.body.id } })).toMatchObject({ status: "DELIVERED", paymentStatus: "PAID" });
  });

  it("keeps ordering unchanged when the sheet is not configured", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect((await placeOrder()).status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports status and syncs every order, for the admin only", async () => {
    const anonymous = await request(createApp()).get("/api/v1/admin/sheets/status");
    expect(anonymous.status).toBe(401);
    expect((await request(createApp()).post("/api/v1/admin/sheets/sync")).status).toBe(401);

    const agent = await loggedInAgent();
    for (const key of ENV_KEYS) delete process.env[key];
    expect((await agent.get("/api/v1/admin/sheets/status")).body).toEqual({ configured: false });
    expect((await agent.post("/api/v1/admin/sheets/sync")).body.error.code).toBe("SHEETS_NOT_CONFIGURED");

    const product = await seededProduct("house-plant");
    const placed: string[] = [];
    for (let index = 0; index < 3; index += 1) placed.push((await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }))).body.id);
    await prisma.order.updateMany({ where: { id: { in: placed.slice(0, 2) } }, data: { status: "DELIVERED", paymentStatus: "PAID" } });
    configureSheets();
    const { state, fetchMock } = fakeGoogle();
    vi.stubGlobal("fetch", fetchMock);

    const status = await agent.get("/api/v1/admin/sheets/status");
    expect(status.body).toMatchObject({ configured: true, tab: "Orders", sheetUrl: "https://docs.google.com/spreadsheets/d/sheet-id" });
    expect(JSON.stringify(status.body)).not.toContain("BEGIN PRIVATE KEY");

    const synced = await agent.post("/api/v1/admin/sheets/sync");
    expect(synced.body).toEqual({ synced: 2 });
    expect(state.rows).toHaveLength(3);
  });

  async function completedPaidOrder() {
    const created = await placeOrder();
    await prisma.order.update({ where: { id: created.body.id }, data: { status: "DELIVERED", paymentStatus: "PAID" } });
    return created.body as { id: string; orderNumber: string };
  }

  it("records on each order when its row was written, and why it was not", async () => {
    configureSheets();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const order = await completedPaidOrder();
    const agent = await loggedInAgent();

    // Google refuses the service account: the order keeps its state and is marked as not synced.
    vi.stubGlobal("fetch", fakeGoogle({ tokenStatus: 401 }).fetchMock);
    const refused = await agent.post(`/api/v1/admin/sheets/sync/${order.id}`);
    expect(refused.status).toBe(502);
    expect(refused.body.error.code).toBe("SHEETS_AUTH_FAILED");
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: "DELIVERED", sheetSyncedAt: null, sheetSyncError: "GOOGLE_AUTH_FAILED" });

    // Retrying once Google works writes one row and clears the error; retrying again does not add a second row.
    resetGoogleTokenCache();
    const { state, fetchMock } = fakeGoogle();
    vi.stubGlobal("fetch", fetchMock);
    expect((await agent.post(`/api/v1/admin/sheets/sync/${order.id}`).expect(200)).body).toEqual({ written: true, qualifies: true });
    await agent.post(`/api/v1/admin/sheets/sync/${order.id}`).expect(200);
    expect(state.rows.filter((row) => row[1] === order.orderNumber)).toHaveLength(1);
    const synced = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(synced.sheetSyncError).toBeNull();
    expect(synced.sheetSyncedAt).toBeInstanceOf(Date);
    const listed = await agent.get("/api/v1/admin/orders");
    expect(listed.body.items[0]).toMatchObject({ sheetSyncError: null, sheetSyncedAt: expect.any(String) });
  });

  it("treats a timeout like any other failure: the order is kept and can be retried", async () => {
    configureSheets();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const created = await placeOrder();
    const agent = await loggedInAgent();
    await agent.patch(`/api/v1/admin/orders/${created.body.id}/payment`).send({ paymentStatus: "PAID" }).expect(200);
    await agent.patch(`/api/v1/admin/orders/${created.body.id}/status`).send({ status: "CONFIRMED" }).expect(200);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("The operation timed out.", "TimeoutError"); }));
    await agent.patch(`/api/v1/admin/orders/${created.body.id}/status`).send({ status: "DELIVERED" }).expect(200);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({ status: "DELIVERED", sheetSyncError: "SHEETS_SYNC_FAILED" });
  });

  it("does not mark orders that do not belong in the sheet, and refuses unknown orders", async () => {
    configureSheets();
    const { state, fetchMock } = fakeGoogle();
    vi.stubGlobal("fetch", fetchMock);
    const created = await placeOrder();
    const agent = await loggedInAgent();
    expect((await agent.post(`/api/v1/admin/sheets/sync/${created.body.id}`).expect(200)).body).toEqual({ written: false, qualifies: false });
    expect(state.rows).toHaveLength(0);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({ sheetSyncedAt: null, sheetSyncError: null });
    expect((await agent.post("/api/v1/admin/sheets/sync/no-such-order")).status).toBe(404);
    expect((await request(createApp()).post(`/api/v1/admin/sheets/sync/${created.body.id}`)).status).toBe(401);
  });

  it("marks every order written by Sync all", async () => {
    configureSheets();
    vi.stubGlobal("fetch", fakeGoogle().fetchMock);
    const order = await completedPaidOrder();
    const agent = await loggedInAgent();
    expect((await agent.post("/api/v1/admin/sheets/sync").expect(200)).body).toEqual({ synced: 1 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).sheetSyncedAt).toBeInstanceOf(Date);
  });

  it("answers a failed sync with a generic error that carries no Google details", async () => {
    const agent = await loggedInAgent();
    configureSheets();
    vi.stubGlobal("fetch", fakeGoogle({ sheetsStatus: 403 }).fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await agent.post("/api/v1/admin/sheets/sync");

    expect(response.status).toBe(502);
    expect(response.body.error).toEqual({ code: "SHEETS_SYNC_FAILED", message: "Could not update the Google Sheet", requestId: expect.any(String) });
  });
});
