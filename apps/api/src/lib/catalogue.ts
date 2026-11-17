import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./prisma.js";
import { buildHomeBootstrap, isHomeBootstrap } from "./home-bootstrap.js";

// The public catalogue: every published product with only customer-safe fields. It is served two ways:
//  - GET /api/v1/catalogue, which Vercel's CDN caches for a minute and keeps serving while it refreshes
//    (so the storefront keeps its products through a cold start or a short database outage), and
//  - a snapshot written at build time to the web app's public folder, the last fallback if the API has
//    never answered. The snapshot is a build output and is never committed.
// Nothing here authorises a purchase: checkout re-reads prices, publication and stock on the server.

export interface PublicCatalogueMedia {
  url: string;
  altText: string;
  width: number | null;
  height: number | null;
  purpose: string | null;
  sortOrder: number;
  /** Links a photograph's catalogue and detail files (empty on older photographs). */
  photoKey: string | null;
}

export interface PublicCatalogueProduct {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  description: string;
  descriptionAr: string | null;
  category: string;
  categoryAr: string | null;
  light: string | null;
  lightAr: string | null;
  priceQar: number;
  compareAtPriceQar: number | null;
  featured: boolean;
  scientificName: string | null;
  // Extra search words set in admin, so the storefront can search its saved copy the way the API does.
  searchAliases: string | null;
  careLevel: string | null;
  heightCm: number | null;
  sizeNote: string | null;
  sizeNoteAr: string | null;
  potIncluded: boolean | null;
  handlingNote: string | null;
  handlingNoteAr: string | null;
  placement: string | null;
  watering: string | null;
  wateringAr: string | null;
  humidity: string | null;
  humidityAr: string | null;
  soil: string | null;
  soilAr: string | null;
  temperature: string | null;
  temperatureAr: string | null;
  stock: number;
  inStock: boolean;
  createdAt: string;
  image: PublicCatalogueMedia | null;
  media: PublicCatalogueMedia[];
}

export interface PublicCatalogue {
  version: string;
  generatedAt: string;
  productCount: number;
  products: PublicCatalogueProduct[];
}

const publicMediaSelection = {
  url: true,
  altText: true,
  width: true,
  height: true,
  purpose: true,
  sortOrder: true,
  photoKey: true,
} as const;

const publicProductSelection = {
  id: true,
  slug: true,
  name: true,
  nameAr: true,
  description: true,
  descriptionAr: true,
  category: true,
  categoryAr: true,
  light: true,
  lightAr: true,
  priceQar: true,
  compareAtPriceQar: true,
  featured: true,
  scientificName: true,
  searchAliases: true,
  careLevel: true,
  heightCm: true,
  sizeNote: true,
  sizeNoteAr: true,
  potIncluded: true,
  handlingNote: true,
  handlingNoteAr: true,
  placement: true,
  watering: true,
  wateringAr: true,
  humidity: true,
  humidityAr: true,
  soil: true,
  soilAr: true,
  temperature: true,
  temperatureAr: true,
  createdAt: true,
  updatedAt: true,
  media: {
    select: publicMediaSelection,
    orderBy: { sortOrder: "asc" as const },
  },
  inventory: { select: { quantity: true, updatedAt: true } },
} as const;

// Public fields only. Supplier cost, internal notes, and admin-only data are
// deliberately excluded so the snapshot is safe to serve to any customer.
function mapProduct(record: {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  description: string;
  descriptionAr: string | null;
  category: string;
  categoryAr: string | null;
  light: string | null;
  lightAr: string | null;
  priceQar: number;
  compareAtPriceQar: number | null;
  featured: boolean;
  scientificName: string | null;
  searchAliases: string | null;
  careLevel: string | null;
  heightCm: number | null;
  sizeNote: string | null;
  sizeNoteAr: string | null;
  potIncluded: boolean | null;
  handlingNote: string | null;
  handlingNoteAr: string | null;
  placement: string | null;
  watering: string | null;
  wateringAr: string | null;
  humidity: string | null;
  humidityAr: string | null;
  soil: string | null;
  soilAr: string | null;
  temperature: string | null;
  temperatureAr: string | null;
  createdAt: Date;
  media: Array<{
    url: string;
    altText: string;
    width: number | null;
    height: number | null;
    purpose: string | null;
    sortOrder: number;
    photoKey: string | null;
  }>;
  inventory: { quantity: number } | null;
}): PublicCatalogueProduct {
  const media: PublicCatalogueProduct["media"] = record.media.map((medium) => ({
    url: medium.url,
    altText: medium.altText,
    width: medium.width,
    height: medium.height,
    purpose: medium.purpose,
    sortOrder: medium.sortOrder,
    photoKey: medium.photoKey,
  }));
  const stock = record.inventory?.quantity ?? 0;
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    nameAr: record.nameAr,
    description: record.description,
    descriptionAr: record.descriptionAr,
    category: record.category,
    categoryAr: record.categoryAr,
    light: record.light,
    lightAr: record.lightAr,
    priceQar: record.priceQar,
    compareAtPriceQar: record.compareAtPriceQar && record.compareAtPriceQar > record.priceQar ? record.compareAtPriceQar : null,
    featured: record.featured,
    scientificName: record.scientificName,
    searchAliases: record.searchAliases?.trim() || null,
    careLevel: record.careLevel,
    heightCm: record.heightCm,
    sizeNote: record.sizeNote,
    sizeNoteAr: record.sizeNoteAr,
    potIncluded: record.potIncluded,
    handlingNote: record.handlingNote,
    handlingNoteAr: record.handlingNoteAr,
    placement: record.placement,
    watering: record.watering,
    wateringAr: record.wateringAr,
    humidity: record.humidity,
    humidityAr: record.humidityAr,
    soil: record.soil,
    soilAr: record.soilAr,
    temperature: record.temperature,
    temperatureAr: record.temperatureAr,
    stock,
    inStock: stock > 0,
    createdAt: record.createdAt.toISOString(),
    image: media[0] ?? null,
    media,
  };
}

// The newest change across published products, their photos and stock, so every meaningful catalogue
// change produces a new version string. Three single-row aggregates, not a scan of every row.
async function latestCatalogueUpdate(): Promise<Date> {
  const [products, media, inventory] = await Promise.all([
    prisma.product.aggregate({ where: { published: true }, _max: { updatedAt: true } }),
    prisma.productMedia.aggregate({ where: { product: { published: true } }, _max: { updatedAt: true } }),
    prisma.inventory.aggregate({ where: { product: { published: true } }, _max: { updatedAt: true } }),
  ]);
  const times = [products._max.updatedAt, media._max.updatedAt, inventory._max.updatedAt]
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());
  return times.length ? new Date(Math.max(...times)) : new Date(0);
}

export async function buildPublicCatalogue(): Promise<PublicCatalogue> {
  const generatedAt = new Date();
  const [latest, products] = await Promise.all([
    latestCatalogueUpdate(),
    prisma.product.findMany({
      where: { published: true },
      select: publicProductSelection,
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    version: latest.toISOString(),
    generatedAt: generatedAt.toISOString(),
    productCount: products.length,
    products: products.map(mapProduct),
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// apps/api/src/lib -> apps/web/public/catalogue (a git-ignored build output)
const catalogueDir = resolve(__dirname, "../../../web/public/catalogue");

export async function writeCatalogueFile(catalogue: PublicCatalogue, directory = catalogueDir): Promise<string> {
  const { mkdirSync, renameSync, writeFileSync } = await import("node:fs");
  mkdirSync(directory, { recursive: true });
  const outputPath = resolve(directory, "catalogue.json");
  const tmpPath = `${outputPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(catalogue)}\n`, "utf8");
  renameSync(tmpPath, outputPath);
  return outputPath;
}

/** Cuts the homepage bootstrap from a catalogue and writes it beside the snapshot (a git-ignored build output). */
export async function writeHomeBootstrapFile(catalogue: PublicCatalogue, directory = catalogueDir): Promise<{ path: string; products: number }> {
  const bootstrap = buildHomeBootstrap(catalogue);
  if (!isHomeBootstrap(bootstrap)) throw new Error("The catalogue has no products to put on the homepage");
  const { mkdirSync, renameSync, writeFileSync } = await import("node:fs");
  mkdirSync(directory, { recursive: true });
  const outputPath = resolve(directory, "home-bootstrap.json");
  const tmpPath = `${outputPath}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(bootstrap)}\n`, "utf8");
  renameSync(tmpPath, outputPath);
  return { path: outputPath, products: bootstrap.products.length };
}
