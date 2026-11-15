import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { deliverNotification, MAX_ATTEMPTS, processDueNotifications } from "../src/modules/notifications/outbox";
import { renderOrderEmail } from "../src/modules/notifications/email-templates";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

// The admin's order emails. No real email is ever sent here: the provider's HTTP endpoint is replaced by a fake, and
// the recipient is the provider's own test address.
const outbox = (prisma as any).notificationOutbox;
const TEST_KEY = "re_test_key_not_a_real_key";
const RECIPIENT = "delivered@resend.dev";

type Sent = { url: string; headers: Record<string, string>; body: { from: string; to: string[]; subject: string; html: string; text: string } };

function fakeProvider(respond: (attempt: number) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    sent.push({ url: String(url), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return respond(sent.length);
  }));
  return sent;
}
const accepted = () => new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
const failing = (status: number) => () => new Response(JSON.stringify({ message: "nope" }), { status });

describe("order email notifications", () => {
  beforeEach(async () => {
    await resetDatabase();
    process.env.EMAIL_PROVIDER_API_KEY = TEST_KEY;
    process.env.ORDER_NOTIFICATION_EMAIL = RECIPIENT;
    process.env.CRON_SECRET = "test-cron-secret-0123456789";
    process.env.EMAIL_FROM = "";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const name of ["EMAIL_PROVIDER_API_KEY", "ORDER_NOTIFICATION_EMAIL", "CRON_SECRET", "EMAIL_FROM"]) process.env[name] = "";
  });
  afterAll(() => prisma.$disconnect());

  async function place(overrides: Record<string, unknown> = {}, key?: string) {
    const product = await seededProduct("house-plant");
    await prisma.product.update({ where: { id: product.id }, data: { priceQar: 60 } });
    const call = request(createApp()).post("/api/v1/orders");
    if (key) call.set("Idempotency-Key", key);
    return call.send({ ...validOrder({ items: [{ productId: product.id, quantity: 2 }] }), ...overrides });
  }

  it("emails the admin once when an order is placed, with the order's details and no internal data", async () => {
    const sent = fakeProvider(accepted);
    const placed = await place({ deliveryNotes: "Ring the bell <twice>" }, "notify-attempt-key-0001");
    expect(placed.status).toBe(201);

    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email.url).toBe("https://api.resend.com/emails");
    expect(email.headers.Authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(email.headers["Idempotency-Key"]).toBe(`qleaves-order-created:${placed.body.id}`);
    expect(email.body.to).toEqual([RECIPIENT]);
    expect(email.body.subject).toContain(placed.body.orderNumber);
    for (const expected of ["New order received", placed.body.orderNumber, "Aisha Al-Mansoori", "+974 5555 1234", "aisha@example.com", "House Plant", "QAR 120", "Cash on delivery", "Not paid yet", "12 Palm Street", "Qatar time", "To be confirmed with the customer", "/admin/orders?order="]) {
      expect(email.body.html, expected).toContain(expected);
      expect(email.body.text, expected).toContain(expected);
    }
    // Customer text is escaped, missing address parts are named as missing, and nothing internal leaks.
    expect(email.body.html).toContain("Ring the bell &lt;twice&gt;");
    expect(email.body.html).not.toContain("<twice>");
    expect(email.body.html).toContain("Not provided");
    for (const secret of ["notify-attempt-key-0001", TEST_KEY, "idempotency", "passwordHash"]) expect(JSON.stringify(email.body)).not.toContain(secret);

    const rows = await outbox.findMany({ where: { orderId: placed.body.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ eventType: "ORDER_CREATED", status: "SENT", attempts: 1, recipient: RECIPIENT, providerMessageId: "email_123", lastErrorCode: null });
    expect(rows[0].sentAt).toBeInstanceOf(Date);

    // The same checkout attempt sent again returns the same order and sends nothing more.
    const replay = await place({ deliveryNotes: "Ring the bell <twice>" }, "notify-attempt-key-0001");
    expect(replay.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(await outbox.count()).toBe(1);
  });

  it("shows the confirmed pin's address parts, in Arabic or English, and marks the ones that are missing", () => {
    const email = renderOrderEmail({
      id: "o1", orderNumber: "QL-20261115-TEST01", createdAt: new Date("2026-11-15T09:30:00Z"), customerName: "نورة الكواري", phone: "+97455550000", email: "",
      addressLine1: "مبنى 14، شارع 840، منطقة 38", area: "Doha", paymentMethod: "COD", paymentStatus: "PENDING", subtotalQar: 200, deliveryFeeQar: 0, deliveryChargePending: false,
      items: [{ productName: "Peace Lily", quantity: 1, unitPriceQar: 200 }],
      deliveryLocation: { latitude: 25.2867, longitude: 51.5333, formattedAddress: "Souq Waqif, Qatar", area: "سوق واقف", zone: "38", street: "شارع 840", building: "14", unit: null, landmark: null },
    }, "ORDER_CREATED");
    expect(email.html).toContain('dir="auto">نورة الكواري');
    expect(email.html).toContain("15 Nov 2026, 12:30 (Qatar time)");
    expect(email.text).toContain("Municipality: Doha");
    expect(email.text).toContain("Zone: 38");
    expect(email.text).toContain("Flat / floor: Not provided");
    expect(email.text).toContain("Landmark: Not provided");
    expect(email.text).toContain("Email: Not provided");
    expect(email.text).toContain("Delivery charge: Free");
    expect(email.text).toContain("Order total: QAR 200");
    expect(email.text).toContain("Pin confirmed on the map (25.286700, 51.533300)");
  });

  it("still accepts the order when the email provider is down, then delivers on a later retry", async () => {
    const sent = fakeProvider((attempt) => (attempt === 1 ? failing(503)() : accepted()));
    const placed = await place();
    expect(placed.status).toBe(201);
    const [row] = await outbox.findMany({ where: { orderId: placed.body.id } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "PROVIDER_ERROR" });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000);

    // Not due yet: the worker leaves it alone.
    expect(await processDueNotifications()).toMatchObject({ checked: 0 });
    expect(sent).toHaveLength(1);
    // Due: delivered.
    const later = new Date(Date.now() + 2 * 60_000);
    expect(await processDueNotifications({ now: later })).toMatchObject({ checked: 1, sent: 1 });
    expect(sent).toHaveLength(2);
    expect(sent[1].headers["Idempotency-Key"]).toBe(sent[0].headers["Idempotency-Key"]);
    expect(await outbox.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "SENT", attempts: 2, lastErrorCode: null });
  });

  it("records a timeout and keeps the order", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })));
    const { sendEmail } = await import("../src/modules/notifications/email-provider");
    expect(await sendEmail({ to: RECIPIENT, subject: "s", html: "h", text: "t", idempotencyKey: "k" }, 50)).toEqual({ ok: false, code: "TIMEOUT", retryable: true });
  });

  it("does not retry an address the provider rejects, and gives up after the last attempt otherwise", async () => {
    fakeProvider(failing(422));
    const rejected = await place();
    expect(rejected.status).toBe(201);
    expect((await outbox.findMany({ where: { orderId: rejected.body.id } }))[0]).toMatchObject({ status: "FAILED", attempts: 1, lastErrorCode: "REJECTED" });

    vi.unstubAllGlobals();
    const sent = fakeProvider(failing(500));
    const second = await place();
    const [row] = await outbox.findMany({ where: { orderId: second.body.id } });
    let now = Date.now();
    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
      now += 24 * 3_600_000;
      await deliverNotification(row.id, new Date(now));
    }
    expect(sent).toHaveLength(MAX_ATTEMPTS);
    expect(await outbox.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS, lastErrorCode: "PROVIDER_ERROR" });
    // Given up: the worker never touches it again.
    expect(await processDueNotifications({ now: new Date(now + 365 * 24 * 3_600_000) })).toMatchObject({ checked: 0 });
    expect(await prisma.order.count()).toBe(2);
  });

  it("sends one email when several workers run at the same moment", async () => {
    const sent = fakeProvider((attempt) => (attempt === 1 ? failing(500)() : accepted()));
    const placed = await place();
    const later = new Date(Date.now() + 2 * 60_000);
    await Promise.all([processDueNotifications({ now: later }), processDueNotifications({ now: later }), processDueNotifications({ now: later })]);
    expect(sent).toHaveLength(2); // the failed first attempt, then exactly one retry
    expect((await outbox.findMany({ where: { orderId: placed.body.id } }))[0]).toMatchObject({ status: "SENT", attempts: 2 });
  });

  it("lets an admin see failed emails and send one again", async () => {
    fakeProvider(failing(422));
    const placed = await place();
    const [row] = await outbox.findMany({ where: { orderId: placed.body.id } });
    const admin = await loggedInAgent();

    const orders = await admin.get("/api/v1/admin/orders").expect(200);
    expect(orders.body.items[0].notifications).toEqual([expect.objectContaining({ id: row.id, eventType: "ORDER_CREATED", status: "FAILED", lastErrorCode: "REJECTED" })]);
    const failed = await admin.get("/api/v1/admin/notifications?status=FAILED").expect(200);
    expect(failed.body).toMatchObject({ configured: true });
    expect(failed.body.items).toHaveLength(1);
    expect(failed.body.items[0].order.orderNumber).toBe(placed.body.orderNumber);

    vi.unstubAllGlobals();
    const sent = fakeProvider(accepted);
    const retried = await admin.post(`/api/v1/admin/notifications/${row.id}/retry`).expect(200);
    expect(retried.body).toMatchObject({ status: "SENT", attempts: 1 });
    expect(sent).toHaveLength(1);
    expect((await admin.post(`/api/v1/admin/notifications/${row.id}/retry`)).status).toBe(409);
    expect((await admin.post("/api/v1/admin/notifications/unknown/retry")).status).toBe(404);
    expect((await request(createApp()).post(`/api/v1/admin/notifications/${row.id}/retry`)).status).toBe(401);
    expect((await request(createApp()).get("/api/v1/admin/notifications")).status).toBe(401);
  });

  it("records the event without sending when order emails are not set up", async () => {
    process.env.EMAIL_PROVIDER_API_KEY = "";
    const sent = fakeProvider(accepted);
    const placed = await place();
    expect(placed.status).toBe(201);
    expect(sent).toHaveLength(0);
    expect((await outbox.findMany({ where: { orderId: placed.body.id } }))[0]).toMatchObject({ status: "DISABLED", attempts: 0 });
    expect(await processDueNotifications({ now: new Date(Date.now() + 365 * 24 * 3_600_000) })).toMatchObject({ checked: 0 });
    const admin = await loggedInAgent();
    expect((await admin.get("/api/v1/admin/notifications").expect(200)).body.configured).toBe(false);
  });

  it("runs the scheduled worker only with the secret", async () => {
    const sent = fakeProvider((attempt) => (attempt === 1 ? failing(500)() : accepted()));
    const placed = await place();
    await outbox.updateMany({ where: { orderId: placed.body.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    const app = createApp();
    expect((await request(app).get("/api/v1/internal/worker")).status).toBe(401);
    expect((await request(app).get("/api/v1/internal/worker").set("Authorization", "Bearer wrong-secret-0123456789abc")).status).toBe(401);
    const run = await request(app).get("/api/v1/internal/worker").set("Authorization", "Bearer test-cron-secret-0123456789").expect(200);
    expect(run.body.notifications).toMatchObject({ checked: 1, sent: 1 });
    expect(sent).toHaveLength(2);
    process.env.CRON_SECRET = "";
    expect((await request(app).get("/api/v1/internal/worker").set("Authorization", "Bearer ")).status).toBe(401);
  });
});
