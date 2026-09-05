import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { inventoryFor, loggedInAgent, resetDatabase, seededProduct } from "./helpers";

describe("admin product management", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("rejects anonymous product management requests", async () => {
    const response = await request(createApp()).get("/api/v1/admin/products");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("lists persisted integer prices and stock for an authenticated admin", async () => {
    const agent = await loggedInAgent();
    const response = await agent.get("/api/v1/admin/products");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.items).toContainEqual(
      expect.objectContaining({
        slug: "house-plant",
        name: "House Plant",
        priceQar: 180,
        stock: 12,
      }),
    );
  });

  it("persists price and inventory together and exposes them publicly", async () => {
    const product = await seededProduct("house-plant");
    const agent = await loggedInAgent();

    const updated = await agent
      .patch(`/api/v1/admin/products/${product.id}`)
      .send({ priceQar: 215, stock: 7 });

    expect(updated.status).toBe(200);
    expect(updated.body).toEqual(
      expect.objectContaining({ id: product.id, priceQar: 215, stock: 7 }),
    );
    expect(await prisma.product.findUnique({ where: { id: product.id } }))
      .toMatchObject({ priceQar: 215 });
    expect(await inventoryFor(product.id)).toMatchObject({ quantity: 7 });

    const publicResponse = await request(createApp())
      .get("/api/v1/products/house-plant");
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body).toEqual(
      expect.objectContaining({ priceQar: 215, stock: 7, inStock: true }),
    );
  });

  it("creates a published plant only when a valid image is supplied", async () => {
    const agent = await loggedInAgent();
    const response = await agent.post("/api/v1/admin/products").send({
      name: "New Fern",
      slug: "new-fern",
      sku: "QL-NF-007",
      description: "A fresh fern for a shaded corner.",
      category: "Indoor",
      light: "Low indirect",
      priceQar: 90,
      costPrice: 35,
      stock: 4,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=",
      imageAltText: "New fern in a pot",
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ slug: "new-fern", stock: 4 }));
    expect(await prisma.product.findUnique({ where: { slug: "new-fern" }, include: { media: true } }))
      .toMatchObject({ published: true, media: [{ altText: "New fern in a pot" }] });
  });

  it("rejects a plant without an image", async () => {
    const agent = await loggedInAgent();
    const response = await agent.post("/api/v1/admin/products").send({
      name: "Missing Image",
      slug: "missing-image",
      sku: "QL-MI-008",
      description: "This plant is missing its required image.",
      category: "Indoor",
      light: "Low indirect",
      priceQar: 90,
      costPrice: 35,
      stock: 4,
      imageAltText: "Missing image",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it.each([
    [{ priceQar: 12.5 }, "decimal price"],
    [{ stock: -1 }, "negative stock"],
    [{}, "empty patch"],
  ])("rejects invalid updates: %s (%s)", async (body) => {
    const product = await seededProduct("house-plant");
    const agent = await loggedInAgent();

    const response = await agent
      .patch(`/api/v1/admin/products/${product.id}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates and edits Arabic product content without changing English fields", async () => {
    const agent = await loggedInAgent();
    const created = await agent.post("/api/v1/admin/products").send({
      name: "Arabic Fern",
      nameAr: "سرخس عربي",
      slug: "arabic-fern",
      sku: "QL-AF-009",
      description: "A fresh fern with localized catalogue content.",
      descriptionAr: "سرخس أخضر بمحتوى عربي للعرض في المتجر.",
      category: "Indoor",
      categoryAr: "داخلي",
      light: "Low indirect",
      lightAr: "إضاءة منخفضة غير مباشرة",
      priceQar: 95,
      costPrice: 40,
      stock: 5,
      imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=",
      imageAltText: "Arabic fern in a pot",
    });

    expect(created.status).toBe(201);
    expect(created.body).toEqual(expect.objectContaining({
      nameAr: "سرخس عربي",
      categoryAr: "داخلي",
    }));

    const updated = await agent.patch(`/api/v1/admin/products/${created.body.id}`).send({
      nameAr: "سرخس عربي محدث",
      lightAr: "إضاءة متوسطة غير مباشرة",
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual(expect.objectContaining({
      name: "Arabic Fern",
      nameAr: "سرخس عربي محدث",
      lightAr: "إضاءة متوسطة غير مباشرة",
    }));

    const publicArabic = await request(createApp()).get("/api/v1/products/arabic-fern?lang=ar");
    expect(publicArabic.body.name).toBe("سرخس عربي محدث");
  });


});
