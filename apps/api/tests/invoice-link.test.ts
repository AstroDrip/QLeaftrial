import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { invoiceToken, isValidInvoiceToken } from "../src/modules/orders/invoice-link";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

describe("customer invoice links and order change summaries", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  async function placeOrder(items: Array<{ productId: string; quantity: number }>) {
    const created = await request(createApp()).post("/api/v1/orders").send(validOrder({ items }));
    expect(created.status).toBe(201);
    return created.body as { id: string; orderNumber: string };
  }

  it("signs links per order and rejects a token that belongs to another order", () => {
    expect(invoiceToken("order-a")).toHaveLength(32);
    expect(invoiceToken("order-a")).toBe(invoiceToken("order-a"));
    expect(isValidInvoiceToken("order-a", invoiceToken("order-a"))).toBe(true);
    expect(isValidInvoiceToken("order-b", invoiceToken("order-a"))).toBe(false);
    expect(isValidInvoiceToken("order-a", undefined)).toBe(false);
    expect(isValidInvoiceToken("order-a", "short")).toBe(false);
  });

  it("gives the admin a link token for each order and opens the invoice for it without signing in", async () => {
    const product = await seededProduct("house-plant");
    const order = await placeOrder([{ productId: product.id, quantity: 2 }]);
    const admin = await loggedInAgent();
    const listed = (await admin.get("/api/v1/admin/orders")).body.items[0];
    expect(listed.invoiceToken).toBe(invoiceToken(order.id));

    const invoice = await request(createApp()).get(`/api/v1/invoices/${order.orderNumber}`).query({ token: listed.invoiceToken });

    expect(invoice.status).toBe(200);
    expect(invoice.headers["cache-control"]).toBe("no-store");
    expect(invoice.headers["x-robots-tag"]).toContain("noindex");
    expect(invoice.body).toMatchObject({ orderNumber: order.orderNumber, customerName: "Aisha Al-Mansoori", subtotalQar: product.priceQar * 2, deliveryFeeQar: 0 });
    expect(invoice.body.items).toHaveLength(1);
    expect(JSON.stringify(invoice.body)).not.toContain("aisha@example.com");
  });

  it("treats a missing or wrong token, an unknown order and a declined order alike", async () => {
    const product = await seededProduct("house-plant");
    const order = await placeOrder([{ productId: product.id, quantity: 1 }]);
    const app = createApp();

    expect((await request(app).get(`/api/v1/invoices/${order.orderNumber}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/invoices/${order.orderNumber}`).query({ token: "x".repeat(32) })).status).toBe(404);
    expect((await request(app).get("/api/v1/invoices/QL-NOPE").query({ token: invoiceToken("nope") })).status).toBe(404);

    const admin = await loggedInAgent();
    await admin.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: "CANCELLED" }).expect(200);
    expect((await request(app).get(`/api/v1/invoices/${order.orderNumber}`).query({ token: invoiceToken(order.id) })).status).toBe(404);
  });

  it("remembers what changed when an edited pending order is accepted", async () => {
    const house = await seededProduct("house-plant");
    const snake = await prisma.product.findUniqueOrThrow({ where: { slug: "snake-plant" } });
    const aloe = await prisma.product.findUniqueOrThrow({ where: { slug: "aloe-vera" } });
    const order = await placeOrder([{ productId: house.id, quantity: 3 }, { productId: snake.id, quantity: 1 }]);
    const admin = await loggedInAgent();
    const pending = (await admin.get("/api/v1/admin/orders")).body.items.find((item: { id: string }) => item.id === order.id);
    expect(pending.editChanges).toEqual([]);
    const lineFor = (productId: string) => pending.items.find((item: { productId: string }) => item.productId === productId);

    const accepted = await admin.post(`/api/v1/admin/orders/${order.id}/accept-edited`).send({
      items: [
        { orderItemId: lineFor(house.id).id, included: true, productId: house.id, quantity: 2 },
        { orderItemId: lineFor(snake.id).id, included: true, productId: aloe.id, quantity: 1 },
      ],
    });

    expect(accepted.status).toBe(200);
    expect(accepted.body.editChanges).toEqual([
      { type: "quantity", name: house.name, from: 3, to: 2 },
      { type: "replaced", from: snake.name, to: aloe.name, quantity: 1 },
    ]);
    expect(accepted.body).not.toHaveProperty("editSummary");
    const reloaded = (await admin.get("/api/v1/admin/orders")).body.items.find((item: { id: string }) => item.id === order.id);
    expect(reloaded.editChanges).toHaveLength(2);
  });

  it("records no changes when the order is accepted as it was", async () => {
    const house = await seededProduct("house-plant");
    const order = await placeOrder([{ productId: house.id, quantity: 1 }]);
    const admin = await loggedInAgent();
    const accepted = await admin.patch(`/api/v1/admin/orders/${order.id}/status`).send({ status: "CONFIRMED" });
    expect(accepted.body.editChanges).toEqual([]);
  });
});
