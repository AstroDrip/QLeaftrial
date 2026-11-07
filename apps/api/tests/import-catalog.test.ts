import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { IMPORTED_STOCK, importCatalog, readCatalog } from "../prisma/import-catalog";
import { resetDatabase, seededProduct, validOrder } from "./helpers";
import { createApp } from "../src/app";
import request from "supertest";

describe("client catalogue import", () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it("ships a photo file for every catalogue image", () => {
    for (const product of readCatalog()) {
      for (const media of product.media) {
        expect(existsSync(fileURLToPath(new URL(`../../web/public${media.url}`, import.meta.url))), media.url).toBe(true);
      }
    }
  });

  it("replaces the sample products and keeps ordered ones for history", async () => {
    const ordered = await seededProduct("house-plant");
    await request(createApp()).post("/api/v1/orders").send(validOrder({ items: [{ productId: ordered.id, quantity: 1 }] }));

    const result = await importCatalog();

    const catalog = readCatalog();
    expect(result.created).toBe(catalog.length);
    expect(await prisma.product.count({ where: { slug: "snake-plant" } })).toBe(0);
    expect(await prisma.product.findUnique({ where: { slug: "house-plant" } })).toMatchObject({ published: false });
    const imported = await prisma.product.findUnique({ where: { slug: catalog[0].slug }, include: { inventory: true, media: true } });
    expect(imported?.inventory?.quantity).toBe(IMPORTED_STOCK);
    expect(imported?.media.length).toBe(catalog[0].media.length);
  });

  it("adds the eight Hybrid Bougainvillea photos as unpublished drafts with no invented details", async () => {
    await importCatalog();

    const drafts = await prisma.product.findMany({
      where: { category: "Hybrid Bougainvillea" },
      include: { inventory: true, media: { orderBy: { sortOrder: "asc" } } },
      orderBy: { slug: "asc" },
    });

    expect(drafts).toHaveLength(8);
    for (const draft of drafts) {
      expect(draft).toMatchObject({ published: false, priceQar: 0, costPrice: 0 });
      expect(draft.sku).toMatch(/^HB-DRAFT-\d$/);
      expect(draft.inventory?.quantity).toBe(0);
      expect(draft.media.map((media) => media.purpose)).toEqual(["catalog", "detail"]);
      // Upright photos keep their own proportions instead of being squared.
      for (const media of draft.media) expect(media.height! / media.width!).toBeGreaterThan(1.1);
    }
    const listing = await request(createApp()).get("/api/v1/products?category=Hybrid%20Bougainvillea");
    expect(listing.body.totalItems).toBe(0);
  });

  it("does not overwrite products that already exist", async () => {
    await importCatalog();
    const slug = readCatalog()[0].slug;
    await prisma.product.update({ where: { slug }, data: { priceQar: 999 } });

    const again = await importCatalog();

    expect(again.created).toBe(0);
    expect(await prisma.product.findUnique({ where: { slug } })).toMatchObject({ priceQar: 999 });
  });
});
