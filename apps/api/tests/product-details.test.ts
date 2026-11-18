import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "./helpers";

// Featured products, genuine discounts, care details and the rule that nothing without a price is sold.

describe("product details, merchandising and pricing rules", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("lets admin set care details, a featured flag and an original price, and shows only public ones to customers", async () => {
    const product = await seededProduct("snake-plant");
    const agent = await loggedInAgent();

    const saved = await agent.patch(`/api/v1/admin/products/${product.id}`).send({
      featured: true, compareAtPriceQar: product.priceQar + 20, scientificName: "Dracaena trifasciata",
      watering: "Let the soil dry out between waterings", wateringAr: "اترك التربة تجف بين الريّات",
      careLevel: "easy", placement: "indoor", needsReview: true, reviewNote: "Check the pot size",
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ featured: true, needsReview: true, reviewNote: "Check the pot size", careLevel: "easy" });

    const detail = await request(createApp()).get(`/api/v1/products/${product.slug}?lang=ar`);
    expect(detail.body).toMatchObject({
      featured: true, compareAtPriceQar: product.priceQar + 20, scientificName: "Dracaena trifasciata",
      watering: "اترك التربة تجف بين الريّات", careLevel: "easy", placement: "indoor",
    });
    // Review notes and cost prices are for the shop only.
    expect(JSON.stringify(detail.body)).not.toMatch(/reviewNote|needsReview|costPrice/);

    const featured = await request(createApp()).get("/api/v1/products?featured=1");
    expect(featured.body.items.map((item: { id: string }) => item.id)).toEqual([product.id]);
  });

  it("saves humidity, soil and temperature in both languages, shows them to customers and clears them with null", async () => {
    const product = await seededProduct("snake-plant");
    const agent = await loggedInAgent();
    const care = {
      humidity: "Average room humidity", humidityAr: "رطوبة الغرفة العادية",
      soil: "Free-draining cactus mix", soilAr: "خلطة صبار جيدة التصريف",
      temperature: "18 to 30 °C", temperatureAr: "من 18 إلى 30 درجة مئوية",
    };

    const saved = await agent.patch(`/api/v1/admin/products/${product.id}`).send(care);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject(care);

    const english = await request(createApp()).get(`/api/v1/products/${product.slug}`);
    expect(english.body).toMatchObject({ humidity: care.humidity, soil: care.soil, temperature: care.temperature });
    const arabic = await request(createApp()).get(`/api/v1/products/${product.slug}?lang=ar`);
    expect(arabic.body).toMatchObject({ humidity: care.humidityAr, soil: care.soilAr, temperature: care.temperatureAr, soilAr: care.soilAr });

    const cleared = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ soil: null, soilAr: null });
    expect(cleared.body).toMatchObject({ soil: null, soilAr: null, humidity: care.humidity });
    const tooShort = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ temperature: "x" });
    expect(tooShort.status).toBe(400);
  });

  it("saves size details, shows them in the customer's language and filters by place and size", async () => {
    const tall = await seededProduct("snake-plant");
    const agent = await loggedInAgent();
    const saved = await agent.patch(`/api/v1/admin/products/${tall.id}`).send({
      heightCm: 150, potIncluded: false, placement: "indoor-outdoor",
      sizeNote: "Tall floor plant", sizeNoteAr: "نبات أرضي طويل",
      handlingNote: "Delivered upright by two people", handlingNoteAr: "يُوصَل واقفًا بواسطة شخصين",
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ heightCm: 150, potIncluded: false, sizeNote: "Tall floor plant", handlingNoteAr: "يُوصَل واقفًا بواسطة شخصين" });

    const arabic = await request(createApp()).get(`/api/v1/products/${tall.slug}?lang=ar`);
    expect(arabic.body).toMatchObject({ heightCm: 150, potIncluded: false, sizeNote: "نبات أرضي طويل", handlingNote: "يُوصَل واقفًا بواسطة شخصين" });

    const slugs = async (query: string) => (await request(createApp()).get(`/api/v1/products?${query}`)).body.items.map((item: { slug: string }) => item.slug);
    expect(await slugs("size=large")).toEqual([tall.slug]);
    expect(await slugs("size=small")).toEqual([]);
    // A plant for indoors or outdoors is found by both choices.
    expect(await slugs("placement=outdoor")).toContain(tall.slug);
    expect(await slugs("placement=indoor")).toContain(tall.slug);
    // An unknown value is ignored rather than refused.
    expect((await request(createApp()).get("/api/v1/products?size=huge")).status).toBe(200);

    const filters = await request(createApp()).get("/api/v1/products/filters");
    expect(filters.body.sizes).toEqual(["large"]);
    expect(filters.body.placements).toEqual(expect.arrayContaining(["indoor", "outdoor"]));

    expect((await agent.patch(`/api/v1/admin/products/${tall.id}`).send({ heightCm: 0 })).status).toBe(400);
    expect((await agent.patch(`/api/v1/admin/products/${tall.id}`).send({ heightCm: null, potIncluded: null })).body).toMatchObject({ heightCm: null, potIncluded: null });
  });

  it("finds a plant by its botanical name and by its category", async () => {
    const product = await seededProduct("snake-plant");
    await prisma.product.update({ where: { id: product.id }, data: { scientificName: "Dracaena trifasciata" } });

    const botanical = await request(createApp()).get("/api/v1/products?q=trifasciata");
    expect(botanical.body.items.map((item: { slug: string }) => item.slug)).toContain("snake-plant");
  });

  it("refuses an original price that is not above a real price, and lets a 0 QAR plant be published (shown, not sold)", async () => {
    const product = await seededProduct("snake-plant");
    const agent = await loggedInAgent();

    const notHigher = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ compareAtPriceQar: product.priceQar });
    const zeroPrice = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ priceQar: 0 });
    await prisma.product.update({ where: { id: product.id }, data: { published: false, priceQar: 0 } });
    const publishDraft = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ published: true });
    const pricedAndPublished = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ priceQar: 55, published: true });

    expect(notHigher.body.error.code).toBe("INVALID_COMPARE_AT_PRICE");
    // Owner's decision (2026-11-18): a published plant may sit at 0 QAR ("Price coming soon"); it just cannot be ordered.
    expect(zeroPrice.status).toBe(200);
    expect(zeroPrice.body).toMatchObject({ priceQar: 0, published: true });
    expect(publishDraft.status).toBe(200);
    const wasPriceAtZero = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ priceQar: 0, compareAtPriceQar: 120 });
    expect(wasPriceAtZero.body.error.code).toBe("INVALID_COMPARE_AT_PRICE");
    expect(pricedAndPublished.status).toBe(200);
    expect(pricedAndPublished.body).toMatchObject({ priceQar: 55, published: true });
  });

  it("never sells a product whose price is 0, even if it is published by other means", async () => {
    const product = await seededProduct("snake-plant");
    await prisma.product.update({ where: { id: product.id }, data: { priceQar: 0 } });
    const stockBefore = (await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity;

    const order = await request(createApp()).post("/api/v1/orders").set("Idempotency-Key", `test-${crypto.randomUUID()}`).send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));

    expect(order.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity).toBe(stockBefore);
  });

  it("hides a 'was' price that is not a real reduction", async () => {
    const product = await seededProduct("snake-plant");
    await prisma.product.update({ where: { id: product.id }, data: { compareAtPriceQar: product.priceQar - 1 } });

    const detail = await request(createApp()).get(`/api/v1/products/${product.slug}`);
    expect(detail.body.compareAtPriceQar).toBeNull();
  });
});
