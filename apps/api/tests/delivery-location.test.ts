import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { isInQatar, reverseGeocode, searchPlaces } from "../src/lib/geo/qatar";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";
import { clearOrderRateLimit } from "../src/modules/orders/order-rate-limit";

const SOUQ_WAQIF = { latitude: 25.2867, longitude: 51.5333 };

function location(overrides: Record<string, unknown> = {}) {
  return {
    ...SOUQ_WAQIF,
    formattedAddress: "Ali Bin Abdulla Street, Souq Waqif, Qatar",
    source: "search",
    precision: "street",
    zone: "3",
    street: "Ali Bin Abdulla Street",
    building: "12",
    unit: "Flat 4",
    landmark: "Opposite the falcon souq",
    provider: "qleaves-osm",
    providerRef: "s123",
    confirmedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Qatar geography", () => {
  it("accepts places in Qatar and rejects places outside it, using the real boundary rather than a box", () => {
    for (const [lat, lon] of [[25.322, 51.531], [25.68, 51.5], [25.42, 50.78], [24.99, 51.55], [26.12, 51.2], [24.75, 50.84]]) expect(isInQatar(lat, lon)).toBe(true);
    // Manama (Bahrain), Salwa (Saudi Arabia), Dubai, open sea: all inside a rectangle around Qatar except Dubai.
    for (const [lat, lon] of [[26.2235, 50.5876], [24.73, 50.77], [25.2048, 55.2708], [25.9, 52.9]]) expect(isInQatar(lat, lon)).toBe(false);
    for (const [lat, lon] of [[Number.NaN, 51.5], [25.3, Number.POSITIVE_INFINITY]]) expect(isInQatar(lat, lon)).toBe(false);
  });

  it("finds Qatar places in English and Arabic, with typos, and returns nothing for nonsense", () => {
    expect(searchPlaces("Lusail", "en")[0]).toMatchObject({ label: "Lusail", kind: "area" });
    expect(searchPlaces("lusial", "en")[0]).toMatchObject({ label: "Lusail" });
    expect(searchPlaces("الوكرة", "ar")[0]).toMatchObject({ label: "الوكرة", kind: "area" });
    expect(searchPlaces("Al Khor", "en")[0]).toMatchObject({ label: "Al Khor", kind: "area" });
    expect(searchPlaces("Villaggio", "en")[0].label).toBe("Villaggio Mall");
    // OpenStreetMap also has a landmark called "Salwa Road" (at the Abu Samra border); the street must be among the results.
    expect(searchPlaces("Salwa Road", "en").some((result) => result.kind === "street" && result.precision === "street")).toBe(true);
    expect(searchPlaces("xyzabcq", "en")).toEqual([]);
    for (const result of searchPlaces("Doha", "en")) expect(isInQatar(result.latitude, result.longitude)).toBe(true);
  });

  it("names the nearest street and area for a point, and never claims more precision than it has", () => {
    const here = reverseGeocode(SOUQ_WAQIF.latitude, SOUQ_WAQIF.longitude, "en");
    expect(here.area).toBe("Souq Waqif");
    expect(here.street).toBeTruthy();
    expect(["landmark", "street"]).toContain(here.precision);
    const desert = reverseGeocode(25.05, 51.0, "en");
    expect(desert.street).toBeNull();
    expect(desert.precision).not.toBe("street");
    expect(reverseGeocode(25.1566, 51.6013, "ar").formattedAddress).toContain("قطر");
  });
});

describe("geo API", () => {
  it("searches and reverse-geocodes over POST, so addresses and coordinates stay out of URLs", async () => {
    const app = createApp();
    const search = await request(app).post("/api/v1/geo/search").send({ q: "Katara", lang: "en" });
    expect(search.status).toBe(200);
    expect(search.headers["cache-control"]).toBe("no-store");
    expect(search.body.results[0]).toMatchObject({ label: "Katara" });
    expect(search.body.results.length).toBeLessThanOrEqual(6);

    const reverse = await request(app).post("/api/v1/geo/reverse").send({ ...SOUQ_WAQIF, lang: "en" });
    expect(reverse.body).toMatchObject({ inQatar: true, area: "Souq Waqif" });
    const outside = await request(app).post("/api/v1/geo/reverse").send({ latitude: 26.2235, longitude: 50.5876, lang: "en" });
    expect(outside.body).toEqual({ inQatar: false });

    expect((await request(app).get("/api/v1/geo/search?q=Katara")).status).toBe(404);
    expect((await request(app).post("/api/v1/geo/search").send({ q: "a" })).status).toBe(400);
    expect((await request(app).post("/api/v1/geo/reverse").send({ latitude: 95, longitude: 51 })).status).toBe(400);
    expect((await request(app).post("/api/v1/geo/search").send({ q: "Doha", extra: 1 })).status).toBe(400);
  });
});

describe("delivery location on orders", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  async function order(body: Record<string, unknown>) {
    await clearOrderRateLimit();
    const product = await seededProduct("house-plant");
    return request(createApp()).post("/api/v1/orders").send({ ...validOrder({ items: [{ productId: product.id, quantity: 1 }] }), ...body });
  }

  it("saves the confirmed location with the order, with the area taken from the coordinates", async () => {
    const created = await order({ deliveryLocation: location() });
    expect(created.status).toBe(201);
    const stored = await prisma.orderDeliveryLocation.findUniqueOrThrow({ where: { orderId: created.body.id } });
    expect(stored).toMatchObject({ ...SOUQ_WAQIF, countryCode: "QA", source: "search", precision: "street", area: "Souq Waqif", zone: "3", building: "12", unit: "Flat 4", landmark: "Opposite the falcon souq" });
    expect(stored.confirmedAt).toBeInstanceOf(Date);
    const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(orderRow.deliveryLocationManual).toBe(false);
  });

  it("rejects locations outside Qatar, impossible coordinates, stale or future confirmations, and unknown fields, saving nothing", async () => {
    const before = await prisma.order.count();
    const cases = [
      location({ latitude: 26.2235, longitude: 50.5876 }),
      location({ latitude: 25.2048, longitude: 55.2708, countryCode: "QA" }),
      location({ latitude: 91 }),
      location({ longitude: "51.5" }),
      location({ latitude: undefined }),
      location({ confirmedAt: new Date(Date.now() - 7 * 3600_000).toISOString() }),
      location({ confirmedAt: new Date(Date.now() + 3600_000).toISOString() }),
      location({ confirmedAt: "yesterday" }),
      location({ source: "satellite" }),
      location({ formattedAddress: "" }),
    ];
    for (const deliveryLocation of cases) {
      const response = await order({ deliveryLocation });
      expect(response.status, JSON.stringify(deliveryLocation)).toBe(400);
    }
    expect((await order({ deliveryLocation: location(), deliveryLocationManual: true })).status).toBe(400);
    expect(await prisma.order.count()).toBe(before);
    expect(await prisma.orderDeliveryLocation.count()).toBe(0);
  });

  it("records a manual address when the map was unavailable, and accepts orders from older pages without any location", async () => {
    const manual = await order({ deliveryLocationManual: true });
    expect(manual.status).toBe(201);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: manual.body.id } })).toMatchObject({ deliveryLocationManual: true });
    const older = await order({});
    expect(older.status).toBe(201);
    expect(await prisma.orderDeliveryLocation.count()).toBe(0);
  });

  it("does not leave a location behind when the order itself fails", async () => {
    const product = await seededProduct("house-plant");
    const response = await request(createApp()).post("/api/v1/orders").send({ ...validOrder({ items: [{ productId: product.id, quantity: 999_99 }] }), deliveryLocation: location() });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.orderDeliveryLocation.count()).toBe(0);
  });

  it("shows the location to the admin only, and keeps it off the public invoice", async () => {
    const created = await order({ deliveryLocation: location() });
    expect((await request(createApp()).get("/api/v1/admin/orders")).status).toBe(401);
    const agent = await loggedInAgent();
    const listed = await agent.get("/api/v1/admin/orders").expect(200);
    const mine = listed.body.items.find((item: { id: string }) => item.id === created.body.id);
    expect(mine.deliveryLocation).toMatchObject({ ...SOUQ_WAQIF, area: "Souq Waqif" });

    const invoice = await request(createApp()).get(`/api/v1/invoices/${created.body.orderNumber}?token=${mine.invoiceToken}`);
    expect(invoice.status).toBe(200);
    expect(JSON.stringify(invoice.body)).not.toContain(String(SOUQ_WAQIF.latitude));
    expect(invoice.body).not.toHaveProperty("deliveryLocation");
  });

  it("removes the location with its order", async () => {
    const created = await order({ deliveryLocation: location() });
    await prisma.order.update({ where: { id: created.body.id }, data: { status: "CANCELLED" } });
    await prisma.orderItem.deleteMany({ where: { orderId: created.body.id } });
    await prisma.order.delete({ where: { id: created.body.id } });
    expect(await prisma.orderDeliveryLocation.count()).toBe(0);
  });
});
