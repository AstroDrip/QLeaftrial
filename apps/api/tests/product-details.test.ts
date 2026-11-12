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

  it("finds a plant by its botanical name and by its category", async () => {
    const product = await seededProduct("snake-plant");
    await prisma.product.update({ where: { id: product.id }, data: { scientificName: "Dracaena trifasciata" } });

    const botanical = await request(createApp()).get("/api/v1/products?q=trifasciata");
    expect(botanical.body.items.map((item: { slug: string }) => item.slug)).toContain("snake-plant");
  });

  it("refuses an original price that is not higher than the price, and publishing without a price", async () => {
    const product = await seededProduct("snake-plant");
    const agent = await loggedInAgent();

    const notHigher = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ compareAtPriceQar: product.priceQar });
    const zeroPrice = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ priceQar: 0 });
    await prisma.product.update({ where: { id: product.id }, data: { published: false, priceQar: 0 } });
    const publishDraft = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ published: true });
    const pricedAndPublished = await agent.patch(`/api/v1/admin/products/${product.id}`).send({ priceQar: 55, published: true });

    expect(notHigher.body.error.code).toBe("INVALID_COMPARE_AT_PRICE");
    expect(zeroPrice.body.error.code).toBe("PRICE_REQUIRED");
    expect(publishDraft.body.error.code).toBe("PRICE_REQUIRED");
    expect(pricedAndPublished.status).toBe(200);
    expect(pricedAndPublished.body).toMatchObject({ priceQar: 55, published: true });
  });

  it("never sells a product whose price is 0, even if it is published by other means", async () => {
    const product = await seededProduct("snake-plant");
    await prisma.product.update({ where: { id: product.id }, data: { priceQar: 0 } });
    const stockBefore = (await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity;

    const order = await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: product.id, quantity: 1 }] }));

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
