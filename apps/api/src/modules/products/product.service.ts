import { prisma } from "../../lib/prisma.js";
import type { ProductDetail, ProductQuery, ProductSummary } from "./product.schemas.js";

const PAGE_SIZE = 24;

const publicProductSelection = {
  id: true,
  slug: true,
  name: true,
  description: true,
  category: true,
  light: true,
  priceQar: true,
  media: {
    select: { url: true, altText: true },
    orderBy: { sortOrder: "asc" as const },
  },
  inventory: { select: { quantity: true } },
  arAsset: { select: { glbUrl: true, usdzUrl: true, attribution: true } },
} as const;

type PublicProductRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  light: string;
  priceQar: number;
  media: Array<{ url: string; altText: string }>;
  inventory: { quantity: number } | null;
  arAsset: { glbUrl: string; usdzUrl: string | null; attribution: string } | null;
};

type ProductRepository = {
  findMany(args: {
    where: {
      published: boolean;
      category?: string;
      light?: string;
      OR?: Array<{
        name?: { contains: string };
        description?: { contains: string };
        slug?: { contains: string };
      }>;
    };
    select: typeof publicProductSelection;
    orderBy: { name: "asc" };
    skip: number;
    take: number;
  }): Promise<PublicProductRecord[]>;
  findFirst(args: {
    where: { slug: string; published: boolean };
    select: typeof publicProductSelection;
  }): Promise<PublicProductRecord | null>;
};

// SQLite and PostgreSQL clients share this generated Product delegate shape,
// but TypeScript cannot call generic methods through their runtime union.
const productRepository = prisma.product as unknown as ProductRepository;

function toSummary(product: PublicProductRecord): ProductSummary {
  const [image] = product.media;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    light: product.light,
    priceQar: product.priceQar,
    inStock: (product.inventory?.quantity ?? 0) > 0,
    image: image ?? null,
  };
}

function toDetail(product: PublicProductRecord): ProductDetail {
  return {
    ...toSummary(product),
    description: product.description,
    media: product.media,
    arAsset: product.arAsset,
  };
}

export async function listProducts(query: ProductQuery): Promise<{
  items: ProductSummary[];
  page: number;
  pageSize: number;
}> {
  const products = await productRepository.findMany({
    where: {
      published: true,
      ...(query.category ? { category: query.category } : {}),
      ...(query.light ? { light: query.light } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q } },
              { description: { contains: query.q } },
              { slug: { contains: query.q } },
            ],
          }
        : {}),
    },
    select: publicProductSelection,
    orderBy: { name: "asc" },
    skip: (query.page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return { items: products.map(toSummary), page: query.page, pageSize: PAGE_SIZE };
}

export async function findProductBySlug(slug: string): Promise<ProductDetail | null> {
  const product = await productRepository.findFirst({
    where: { slug, published: true },
    select: publicProductSelection,
  });

  return product ? toDetail(product) : null;
}
