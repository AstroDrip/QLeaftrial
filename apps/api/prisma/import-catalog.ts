import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/prisma.ts";

type CatalogMedia = { url: string; purpose: string; width: number; height: number };
type CatalogProduct = {
  slug: string;
  sku: string;
  name: string;
  nameAr: string | null;
  description: string;
  category: string;
  categoryAr: string | null;
  light: string | null;
  lightAr: string | null;
  descriptionAr?: string | null;
  scientificName?: string | null;
  watering?: string | null;
  wateringAr?: string | null;
  careLevel?: string | null;
  placement?: string | null;
  needsReview?: boolean;
  reviewNote?: string | null;
  priceQar: number;
  published: boolean;
  // Stock for a new product; draft listings set 0 so nothing is promised before the shop counts it.
  stock?: number;
  altText: string;
  media: CatalogMedia[];
};

// Imported from the client's previous WooCommerce store (sparkleplante.qa).
// The old store had no stock counts or cost prices, so imports start with these
// values and the shop sets real ones in admin.
export const IMPORTED_STOCK = 10;
const IMPORTED_COST_PRICE = 0;

// The development sample catalogue that this import replaces.
const SAMPLE_SLUGS = ["house-plant", "fiddle-leaf-fig", "snake-plant", "monstera-deliciosa", "aloe-vera", "peace-lily"];

export function readCatalog(): CatalogProduct[] {
  return JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8")) as CatalogProduct[];
}

type CatalogUpdates = {
  // Existing listings whose photo is replaced by the client's own; applied only while the listing still has
  // exactly the photos it was imported with, so a photo chosen in admin is never overwritten.
  photoUpdates: Record<string, { expectedCurrent: string[]; media: CatalogMedia[] }>;
  // Earlier drafts that are renamed and recategorised; applied only to drafts nobody has edited or published.
  draftRenames: Record<string, Partial<CatalogProduct> & { slug: string; name: string }>;
};

export function readCatalogUpdates(): CatalogUpdates {
  return JSON.parse(readFileSync(new URL("./catalog-updates.json", import.meta.url), "utf8")) as CatalogUpdates;
}

const UNTOUCHED_DRAFT_NAME = /^Hybrid Bougainvillea \d+$/;

export async function applyCatalogUpdates(updates = readCatalogUpdates()): Promise<{ renamed: number; photosReplaced: number; skipped: string[] }> {
  let renamed = 0;
  let photosReplaced = 0;
  const skipped: string[] = [];

  for (const [oldSlug, data] of Object.entries(updates.draftRenames)) {
    const draft = await prisma.product.findUnique({
      where: { slug: oldSlug },
      select: { id: true, name: true, published: true, _count: { select: { orderItems: true } } },
    });
    if (!draft) continue;
    const taken = await prisma.product.findUnique({ where: { slug: data.slug }, select: { id: true } });
    if (draft.published || draft._count.orderItems > 0 || !UNTOUCHED_DRAFT_NAME.test(draft.name) || taken) {
      skipped.push(oldSlug);
      continue;
    }
    const { slug, name, nameAr, category, categoryAr, light, lightAr, description, descriptionAr, scientificName, watering, wateringAr, careLevel, placement, needsReview, reviewNote } = data;
    await prisma.product.update({
      where: { id: draft.id },
      data: { slug, name, nameAr, category, categoryAr, light, lightAr, description, descriptionAr, scientificName, watering, wateringAr, careLevel, placement, needsReview, reviewNote },
    });
    await prisma.productMedia.updateMany({ where: { productId: draft.id }, data: { altText: name } });
    renamed += 1;
  }

  for (const [slug, update] of Object.entries(updates.photoUpdates)) {
    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, name: true, media: { select: { url: true, altText: true }, orderBy: { sortOrder: "asc" } } },
    });
    if (!product) continue;
    const current = product.media.map((media) => media.url);
    const alreadyDone = current.length === update.media.length && current.every((url, index) => url === update.media[index].url);
    if (alreadyDone) continue;
    const untouched = current.length === update.expectedCurrent.length && current.every((url, index) => url === update.expectedCurrent[index]);
    if (!untouched) {
      skipped.push(slug);
      continue;
    }
    const altText = product.media[0]?.altText ?? product.name;
    await prisma.$transaction([
      prisma.productMedia.deleteMany({ where: { productId: product.id } }),
      prisma.productMedia.createMany({ data: update.media.map((media, sortOrder) => ({ ...media, altText, sortOrder, productId: product.id })) }),
    ]);
    photosReplaced += 1;
  }

  return { renamed, photosReplaced, skipped };
}

export async function importCatalog(catalog = readCatalog()): Promise<{ created: number; existing: number; removed: number; unpublished: number }> {
  const catalogSlugs = new Set(catalog.map((product) => product.slug));
  let created = 0;
  for (const product of catalog) {
    const { media, altText, stock, ...fields } = product;
    const mediaRows = media.map((image, sortOrder) => ({ ...image, altText, sortOrder }));
    const existing = await prisma.product.findUnique({ where: { slug: product.slug }, select: { id: true, sku: true } });
    if (existing) {
      // A sample product sharing a catalogue slug (different SKU) takes the client's data;
      // already-imported products keep any edits made in admin.
      if (SAMPLE_SLUGS.includes(product.slug) && existing.sku !== product.sku) {
        await prisma.product.update({ where: { id: existing.id }, data: { ...fields, media: { deleteMany: {}, create: mediaRows } } });
        created += 1;
      }
      continue;
    }
    await prisma.product.create({
      data: {
        ...fields,
        costPrice: IMPORTED_COST_PRICE,
        inventory: { create: { quantity: stock ?? IMPORTED_STOCK } },
        media: { create: mediaRows },
      },
    });
    created += 1;
  }

  let removed = 0;
  let unpublished = 0;
  const samples = await prisma.product.findMany({
    where: { slug: { in: SAMPLE_SLUGS.filter((slug) => !catalogSlugs.has(slug)) } },
    select: { id: true, _count: { select: { orderItems: true } } },
  });
  for (const sample of samples) {
    // Ordered samples are kept (unpublished) so order history stays intact.
    if (sample._count.orderItems > 0) {
      await prisma.product.update({ where: { id: sample.id }, data: { published: false } });
      unpublished += 1;
    } else {
      await prisma.product.delete({ where: { id: sample.id } });
      removed += 1;
    }
  }

  return { created, existing: catalog.length - created, removed, unpublished };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  // Renames first, so a database that already holds the old drafts gets them renamed rather than duplicated.
  applyCatalogUpdates()
    .then(async (updates) => ({ updates, imported: await importCatalog() }))
    .then((result) => console.log(`Catalogue import: ${JSON.stringify(result)}`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
