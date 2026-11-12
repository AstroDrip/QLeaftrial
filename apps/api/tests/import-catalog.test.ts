import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { IMPORTED_STOCK, applyCatalogUpdates, importCatalog, readCatalog, readCatalogUpdates } from "../prisma/import-catalog";
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

  it("adds the eight bougainvillea photos as unpublished Outdoor Plants drafts named by colour, with no price", async () => {
    await importCatalog();

    const drafts = await prisma.product.findMany({
      where: { slug: { startsWith: "bougainvillea-" }, published: false },
      include: { inventory: true, media: { orderBy: { sortOrder: "asc" } } },
      orderBy: { slug: "asc" },
    });

    expect(drafts).toHaveLength(8);
    expect(await prisma.product.count({ where: { category: "Hybrid Bougainvillea" } })).toBe(0);
    for (const draft of drafts) {
      expect(draft).toMatchObject({ published: false, priceQar: 0, costPrice: 0, category: "Outdoor Plants", needsReview: true });
      expect(draft.name).toMatch(/^Bougainvillea /);
      expect(draft.sku).toMatch(/^HB-DRAFT-\d$/);
      expect(draft.inventory?.quantity).toBe(0);
      expect(draft.media.map((media) => media.purpose)).toEqual(["catalog", "detail"]);
      // Upright photos keep their own proportions instead of being squared.
      for (const media of draft.media) expect(media.height! / media.width!).toBeGreaterThan(1.1);
    }
    // The live pink bougainvillea is still there and still published.
    expect(await prisma.product.findUnique({ where: { slug: "bougainvillea-pink" } })).toMatchObject({ published: true });
  });

  it("adds every new plant from the client's photos as a hidden draft with no price or stock", async () => {
    await importCatalog();

    const drafts = await prisma.product.findMany({ where: { sku: { startsWith: "QL-" } }, include: { inventory: true, media: true } });
    expect(drafts).toHaveLength(88);
    for (const draft of drafts) {
      expect(draft).toMatchObject({ published: false, priceQar: 0 });
      expect(draft.inventory?.quantity).toBe(0);
      expect(draft.media.length).toBeGreaterThanOrEqual(2);
      expect(draft.descriptionAr && draft.nameAr).toBeTruthy();
    }
    // Nothing unpublished reaches customers.
    const listing = await request(createApp()).get("/api/v1/products?q=Calathea");
    expect(listing.body.items.every((item: { slug: string }) => !drafts.some((draft) => draft.slug === item.slug))).toBe(true);
  });

  it("renames earlier untouched drafts instead of duplicating them, and leaves edited ones alone", async () => {
    const old = (slug: string, name: string) => prisma.product.create({
      data: { slug, sku: slug.toUpperCase(), name, description: "Draft listing", category: "Hybrid Bougainvillea", priceQar: 0, costPrice: 0, published: false,
        media: { create: [{ url: `/media/plants/${slug}-640.webp`, altText: name, sortOrder: 0 }] } },
    });
    await old("hybrid-bougainvillea-3", "Hybrid Bougainvillea 3");
    await old("hybrid-bougainvillea-5", "My purple one"); // renamed in admin by the shop

    const result = await applyCatalogUpdates();
    await importCatalog();

    expect(result.renamed).toBe(1);
    expect(result.skipped).toContain("hybrid-bougainvillea-5");
    expect(await prisma.product.findUnique({ where: { slug: "bougainvillea-orange" } })).toMatchObject({ name: "Bougainvillea Orange", category: "Outdoor Plants", sku: "HYBRID-BOUGAINVILLEA-3" });
    expect(await prisma.product.count({ where: { slug: "hybrid-bougainvillea-3" } })).toBe(0);
    expect(await prisma.product.findUnique({ where: { slug: "hybrid-bougainvillea-5" } })).toMatchObject({ name: "My purple one" });
  });

  it("swaps in the client's photo only while a listing still has its original photo", async () => {
    const updates = readCatalogUpdates();
    const original = updates.photoUpdates["aloe-vera"].expectedCurrent;
    const make = (slug: string, urls: string[]) => prisma.product.create({
      data: { slug, sku: `T-${slug}`.toUpperCase(), name: slug, description: "Existing listing", category: "Outdoor Plants", priceQar: 25, costPrice: 0, published: true,
        media: { create: urls.map((url, sortOrder) => ({ url, altText: "Aloe", sortOrder })) } },
    });
    await make("aloe-vera", original);
    await make("spider-plant", ["/media/uploads/shop-chosen-photo.webp"]);

    const first = await applyCatalogUpdates(updates);
    const again = await applyCatalogUpdates(updates);

    const aloe = await prisma.product.findUnique({ where: { slug: "aloe-vera" }, include: { media: { orderBy: { sortOrder: "asc" } } } });
    expect(aloe?.media.map((media) => media.url)).toEqual(updates.photoUpdates["aloe-vera"].media.map((media) => media.url));
    expect(aloe?.media[0].altText).toBe("Aloe");
    expect(first.photosReplaced).toBe(1);
    expect(again.photosReplaced).toBe(0);
    expect(first.skipped).toContain("spider-plant");
    const spider = await prisma.product.findUnique({ where: { slug: "spider-plant" }, include: { media: true } });
    expect(spider?.media.map((media) => media.url)).toEqual(["/media/uploads/shop-chosen-photo.webp"]);
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
