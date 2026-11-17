import { generateKeyPairSync } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { settleBackgroundWork } from "../src/lib/after-response";
import { LEASE_MS, deliverNotification, processOutbox } from "../src/modules/notifications/outbox";
import { clearOrderRateLimit } from "../src/modules/orders/order-rate-limit";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

// The order answer never waits for outside services, and the background work they need survives slow providers,
// crashed workers and changes that arrive while a job is running. No real email or Google call is made here.
const outbox = (prisma as any).notificationOutbox;
const RESEND = "https://api.resend.com/emails";
const accepted = () => new Response(JSON.stringify({ id: "email_1" }), { status: 200 });

function provider(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const calls: Array<{ url: string; key?: string }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), key: (init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"] });
    return handler(String(url), init);
  }));
  return calls;
}

describe("the outbox worker", () => {
  beforeEach(async () => {
    await resetDatabase();
    await clearOrderRateLimit();
    process.env.EMAIL_PROVIDER_API_KEY = "re_test_key_not_a_real_key";
    process.env.ORDER_NOTIFICATION_EMAIL = "delivered@resend.dev";
  });
  afterEach(async () => {
    await settleBackgroundWork();
    vi.unstubAllGlobals();
    process.env.EMAIL_PROVIDER_API_KEY = "";
    process.env.ORDER_NOTIFICATION_EMAIL = "";
  });
  afterAll(() => prisma.$disconnect());

  async function place(key = `outbox-${crypto.randomUUID()}`) {
    const product = await seededProduct("house-plant");
    return request(createApp()).post("/api/v1/orders").set("Idempotency-Key", key).send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));
  }

  it("answers the customer at once while the email provider is slow, and sends the email afterwards", async () => {
    let release: () => void = () => undefined;
    const calls = provider(() => new Promise<Response>((resolve) => { release = () => resolve(accepted()); }));
    const started = Date.now();
    const placed = await place();
    const answeredIn = Date.now() - started;
    expect(placed.status).toBe(201);
    expect(answeredIn).toBeLessThan(2_000);
    // The email is still on its way: recorded, claimed, not yet sent.
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect((await outbox.findFirst({ where: { orderId: placed.body.id, eventType: "ORDER_CREATED" } })).status).toBe("SENDING");
    release();
    await settleBackgroundWork();
    expect((await outbox.findFirst({ where: { orderId: placed.body.id, eventType: "ORDER_CREATED" } })).status).toBe("SENT");
  });

  it("recovers a job whose worker stopped after the provider accepted it, without a second distinct email", async () => {
    const calls = provider(async () => accepted());
    process.env.EMAIL_PROVIDER_API_KEY = ""; // no head start: the job is only recorded
    const placed = await place();
    await settleBackgroundWork();
    const job = await outbox.findFirst({ where: { orderId: placed.body.id, eventType: "ORDER_CREATED" } });
    expect(job.status).toBe("DISABLED");
    process.env.EMAIL_PROVIDER_API_KEY = "re_test_key_not_a_real_key";
    // A worker took the job, the provider accepted the email, and the worker died before writing that down.
    const crashedAt = new Date(Date.now() - LEASE_MS - 1_000);
    await outbox.update({ where: { id: job.id }, data: { status: "SENDING", attempts: 1, lastAttemptAt: crashedAt, leaseExpiresAt: new Date(crashedAt.getTime() + LEASE_MS) } });

    expect(await processOutbox()).toMatchObject({ checked: 1, sent: 1 });
    expect(calls).toHaveLength(1);
    // The provider sees the same idempotency key the first attempt used, so it does not deliver a second email.
    expect(calls[0].key).toBe(`qleaves-order-created:${placed.body.id}`);
    expect(await outbox.findUnique({ where: { id: job.id } })).toMatchObject({ status: "SENT", attempts: 2, leaseExpiresAt: null });
  });

  it("never lets a worker that lost its lease overwrite the result of the worker that took over", async () => {
    let failSlowWorker: () => void = () => undefined;
    let first = true;
    provider(() => {
      if (first) { first = false; return new Promise<Response>((resolve) => { failSlowWorker = () => resolve(new Response("{}", { status: 503 })); }); }
      return Promise.resolve(accepted());
    });
    process.env.EMAIL_PROVIDER_API_KEY = "";
    const placed = await place();
    await settleBackgroundWork();
    process.env.EMAIL_PROVIDER_API_KEY = "re_test_key_not_a_real_key";
    const job = await outbox.findFirst({ where: { orderId: placed.body.id, eventType: "ORDER_CREATED" } });
    await outbox.update({ where: { id: job.id }, data: { status: "PENDING" } });

    const slow = deliverNotification(job.id); // claims the job, then hangs on the provider
    await vi.waitFor(async () => expect((await outbox.findUnique({ where: { id: job.id } })).status).toBe("SENDING"));
    // Its lease runs out; another worker takes the job and succeeds.
    expect(await deliverNotification(job.id, new Date(Date.now() + LEASE_MS + 1_000))).toBe("sent");
    // The slow worker now gets its (failed) answer; it no longer holds the lease, so nothing is recorded.
    failSlowWorker();
    expect(await slow).toBe("retry");
    expect(await outbox.findUnique({ where: { id: job.id } })).toMatchObject({ status: "SENT", lastErrorCode: null });
  });

  it("does not hold up an admin change while Google is slow", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.GOOGLE_SHEETS_ID = "sheet-id";
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "robot@example.iam.gserviceaccount.com";
    process.env.GOOGLE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const hanging: Array<() => void> = [];
    let googleCalls = 0;
    try {
      provider((url) => {
        if (url === RESEND) return Promise.resolve(accepted());
        googleCalls += 1;
        return new Promise<Response>((resolve) => { hanging.push(() => resolve(new Response("{}", { status: 503 }))); });
      });
      const placed = await place();
      const admin = await loggedInAgent();
      await admin.patch(`/api/v1/admin/orders/${placed.body.id}/status`).send({ status: "accepted" }).expect(200);
      // Completing an order is the change that makes the worker contact Google.
      const started = Date.now();
      await admin.patch(`/api/v1/admin/orders/${placed.body.id}/status`).send({ status: "completed" }).expect(200);
      expect(Date.now() - started).toBeLessThan(2_000);
      // Google really was being asked, and had not answered, when the admin got their answer.
      await vi.waitFor(() => expect(googleCalls).toBeGreaterThan(0));
    } finally {
      for (const release of hanging) release();
      await settleBackgroundWork();
      for (const name of ["GOOGLE_SHEETS_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"]) process.env[name] = "";
    }
  });

  it("does nothing for jobs that are not due, and picks up due ones after a restart", async () => {
    const calls = provider(async () => accepted());
    process.env.EMAIL_PROVIDER_API_KEY = "";
    const placed = await place();
    await settleBackgroundWork();
    process.env.EMAIL_PROVIDER_API_KEY = "re_test_key_not_a_real_key";
    const job = await outbox.findFirst({ where: { orderId: placed.body.id, eventType: "ORDER_CREATED" } });
    await outbox.update({ where: { id: job.id }, data: { status: "PENDING", nextAttemptAt: new Date(Date.now() + 60_000) } });
    expect(await processOutbox()).toMatchObject({ checked: 0 });
    expect(calls).toHaveLength(0);
    // "After a restart" there is no memory of anything: only the database decides what is due.
    expect(await processOutbox({ now: new Date(Date.now() + 61_000) })).toMatchObject({ sent: 1 });
    expect(calls).toHaveLength(1);
  });
});
