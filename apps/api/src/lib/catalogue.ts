import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./prisma.js";
import {
  objectPathUrl,
  productImageStorageConfig,
  publicObjectUrl,
  storageHeaders,
} from "../modules/admin/product-image-storage.js";

export interface PublicCatalogueMedia {
  url: string;
  altText: string;
  width: number | null;
  height: number | null;
  purpose: string | null;
  sortOrder: number;
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
  stock: number;
  inStock: boolean;
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
  media: Array<{
    url: string;
    altText: string;
    width: number | null;
    height: number | null;
    purpose: string | null;
    sortOrder: number;
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
    stock,
    inStock: stock > 0,
    image: media[0] ?? null,
    media,
  };
}

// Returns the newest update across published products, their photos, and stock
// so every meaningful catalogue change produces a new version string.
async function latestCatalogueUpdate(): Promise<Date> {
  const [products, media, inventory] = await Promise.all([
    prisma.product.findMany({
      where: { published: true },
      select: { updatedAt: true },
    }),
    prisma.productMedia.findMany({ select: { updatedAt: true } }),
    prisma.inventory.findMany({ select: { updatedAt: true } }),
  ]);

  const dates = [
    ...products.map((product) => product.updatedAt),
    ...media.map((medium) => medium.updatedAt),
    ...inventory.map((item) => item.updatedAt),
  ];

  if (dates.length === 0) return new Date();
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

export async function buildPublicCatalogue(): Promise<PublicCatalogue> {
  const generatedAt = new Date();
  const version = (await latestCatalogueUpdate()).toISOString();

  const products = await prisma.product.findMany({
    where: { published: true },
    select: publicProductSelection,
    orderBy: { name: "asc" },
  });

  return {
    version,
    generatedAt: generatedAt.toISOString(),
    productCount: products.length,
    products: products.map(mapProduct),
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// apps/api/src/lib -> repository root
const repositoryRoot = resolve(__dirname, "../../../");
const catalogueDir = resolve(repositoryRoot, "web/public/catalogue");
const catalogueStoragePath = "catalogue/catalogue.json";

function catalogueFilePath(): string {
  return resolve(catalogueDir, "catalogue.json");
}

async function publishToSupabase(catalogue: PublicCatalogue): Promise<string> {
  const config = productImageStorageConfig();
  const body = JSON.stringify(catalogue);

  // Upload to a temporary path first. Supabase Storage makes an object visible
  // only after the PUT completes, so the previously published catalogue remains
  // available until the new one is fully written. Customers never receive a
  // half-written catalogue.
  const tmpPath = `catalogue/tmp/${catalogue.version}.json`;
  const tmpResponse = await fetch(
    objectPathUrl(config.baseUrl, config.bucket, tmpPath),
    {
      method: "PUT",
      headers: {
        ...storageHeaders(config.apiKey, config.legacyBearer),
        "Content-Type": "application/json",
        "x-upsert": "false",
      },
      body,
    },
  );
  if (!tmpResponse.ok) {
    throw new Error(`Catalogue upload failed (${tmpResponse.status})`);
  }

  const publicUrl = publicObjectUrl(
    config.baseUrl,
    config.bucket,
    catalogueStoragePath,
  );
  const copyResponse = await fetch(
    objectPathUrl(config.baseUrl, config.bucket, catalogueStoragePath),
    {
      method: "PUT",
      headers: {
        ...storageHeaders(config.apiKey, config.legacyBearer),
        "Content-Type": "application/json",
        "x-upsert": "false",
      },
      body,
    },
  );
  if (!copyResponse.ok) {
    throw new Error(`Catalogue publish failed (${copyResponse.status})`);
  }

  return publicUrl;
}

// Publishes a freshly built catalogue to a public, read-only location.
//
// Development (SQLite / local filesystem): writes
// apps/web/public/catalogue/catalogue.json so the next storefront load serves
// it immediately.
//
// Production (PostgreSQL / Vercel): the filesystem is read-only, so the
// snapshot is uploaded to the configured Supabase product-image bucket under a
// public path. The previous snapshot remains published until the new one
// completes.
export async function publishCatalogue(
  catalogue: PublicCatalogue,
): Promise<{ publishedUrl: string; version: string }> {
  const usesPostgreSql =
    process.env.QLEAVES_DATABASE_PROVIDER === "postgresql";

  if (usesPostgreSql) {
    const publishedUrl = await publishToSupabase(catalogue);
    return { publishedUrl, version: catalogue.version };
  }

  const filePath = await writeCatalogueFile(catalogue);
  return { publishedUrl: `file://${filePath}`, version: catalogue.version };
}

// Rebuilds the public catalogue and publishes it. Call this after every
// successful admin product mutation (create / update / replace images / delete)
// so the public catalogue stays in sync with the shop.
export async function regeneratePublicCatalogue(): Promise<{
  publishedUrl: string;
  version: string;
}> {
  const catalogue = await buildPublicCatalogue();
  return publishCatalogue(catalogue);
}

export async function writeCatalogueFile(
  catalogue: PublicCatalogue,
): Promise<string> {
  const fs = await import("node:fs");
  const { mkdirSync, renameSync, writeFileSync } = fs;
  const outputPath = catalogueFilePath();
  mkdirSync(catalogueDir, { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(catalogue, null, 2) + "\n", "utf8");
  renameSync(tmpPath, outputPath);
  return outputPath;
}
