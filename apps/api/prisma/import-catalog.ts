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
  importCatalog()
    .then((result) => console.log(`Catalogue import: ${JSON.stringify(result)}`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
