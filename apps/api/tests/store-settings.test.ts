import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

describe("storefront ordering settings", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("defaults ordering to enabled and lets an admin update the setting", async () => {
    const publicSettings = await request(createApp()).get("/api/v1/storefront/settings");
    expect(publicSettings.status).toBe(200);
    expect(publicSettings.body).toEqual(expect.objectContaining({
      orderingEnabled: true,
      commercialRegistration: null,
    }));
    expect(publicSettings.body).not.toHaveProperty("deliveryFeeQar");
    expect(publicSettings.headers["cache-control"]).toBe("public, max-age=0, must-revalidate");
    expect(publicSettings.headers["vercel-cdn-cache-control"]).toContain("stale-while-revalidate");

    const anonymousUpdate = await request(createApp())
      .put("/api/v1/admin/storefront-settings")
      .send({ orderingEnabled: false });
    expect(anonymousUpdate.status).toBe(401);

    const admin = await loggedInAgent();
    const update = await admin
      .put("/api/v1/admin/storefront-settings")
      .send({
        orderingEnabled: false,
        commercialRegistration: "CR-12345",
        ecommerceLicense: "EC-67890",
        businessAddress: "Doha, Qatar",
        supportEmail: "support@example.qa",
        supportPhone: "+974 5555 5555",
      });
    expect(update.status).toBe(200);
    expect(update.body).toEqual(expect.objectContaining({
      orderingEnabled: false,
      commercialRegistration: "CR-12345",
      ecommerceLicense: "EC-67890",
      businessAddress: "Doha, Qatar",
      supportEmail: "support@example.qa",
    }));

    const reloaded = await request(createApp()).get("/api/v1/storefront/settings");
    expect(reloaded.body).toEqual(expect.objectContaining({ orderingEnabled: false }));
  });

  it("takes orders of any size without a delivery charge, even from older pages that still send one", async () => {
    const product = await seededProduct("house-plant");
    await prisma.storeSettings.update({ where: { id: "storefront" }, data: { deliveryFeeQar: 20 } });

    const response = await request(createApp())
      .post("/api/v1/orders")
      .send(validOrder({ deliveryFeeQar: 15, items: [{ productId: product.id, quantity: 1 }] }));

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ subtotalQar: product.priceQar, deliveryFeeQar: 0 }));
    expect(await prisma.order.findUnique({ where: { id: response.body.id } })).toMatchObject({ deliveryFeeQar: 0 });
  });

  it("no longer accepts a delivery charge in the business settings", async () => {
    const admin = await loggedInAgent();
    const response = await admin.put("/api/v1/admin/storefront-settings").send({ deliveryFeeQar: 15 });
    expect(response.status).toBe(400);
  });

  it("rejects new orders while ordering is disabled", async () => {
    const product = await seededProduct("house-plant");
    const admin = await loggedInAgent();
    await admin.put("/api/v1/admin/storefront-settings").send({ orderingEnabled: false });

    const response = await request(createApp())
      .post("/api/v1/orders")
      .send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("ORDERING_DISABLED");
    expect(await prisma.order.count()).toBe(0);
  });
});
