import { prisma } from "../../lib/prisma.js";
import type { ProductDetail, ProductQuery, ProductSummary } from "./product.schemas.js";

const PAGE_SIZE = 24;

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
  media: {
    select: { url: true, altText: true, width: true, height: true, purpose: true },
    orderBy: { sortOrder: "asc" as const },
  },
  inventory: { select: { quantity: true } },
} as const;

type PublicProductRecord = {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  description: string;
  descriptionAr: string | null;
  category: string;
  categoryAr: string | null;
  light: string;
  lightAr: string | null;
  priceQar: number;
  media: Array<{
    url: string;
    altText: string;
    width: number | null;
    height: number | null;
    purpose: string | null;
  }>;
  inventory: { quantity: number } | null;
};

type PublicProductWhere = {
  published: boolean;
  category?: string;
  light?: string;
  OR?: Array<{
    name?: { contains: string };
    description?: { contains: string };
    nameAr?: { contains: string };
    descriptionAr?: { contains: string };
    slug?: { contains: string };
  }>;
};

type ProductRepository = {
  findMany(args: {
    where: PublicProductWhere;
    select: typeof publicProductSelection;
    orderBy: Array<
      | { name: "asc" }
      | { priceQar: "asc" | "desc" }
      | { slug: "asc" }
    >;
    skip: number;
    take: number;
  }): Promise<PublicProductRecord[]>;
  findFirst(args: {
    where: { slug: string; published: boolean };
    select: typeof publicProductSelection;
  }): Promise<PublicProductRecord | null>;
  count(args: { where: PublicProductWhere }): Promise<number>;
};

// SQLite and PostgreSQL clients share this generated Product delegate shape,
// but TypeScript cannot call generic methods through their runtime union.
const productRepository = prisma.product as unknown as ProductRepository;

type ProductFilterRepository = {
  findMany(args: {
    where: { published: boolean };
    select: { category: true; categoryAr: true; light: true; lightAr: true };
  }): Promise<Array<{ category: string; categoryAr: string | null; light: string; lightAr: string | null }>>;
};

const productFilterRepository = prisma.product as unknown as ProductFilterRepository;

function toSummary(
  product: PublicProductRecord,
  language: ProductQuery["lang"] = "en",
): ProductSummary {
  const [image] = product.media;
  const stock = product.inventory?.quantity ?? 0;
  const isArabic = language === "ar";

  return {
    id: product.id,
    slug: product.slug,
    name: isArabic && product.nameAr?.trim() ? product.nameAr : product.name,
    nameAr: product.nameAr,
    category: isArabic && product.categoryAr?.trim() ? product.categoryAr : product.category,
    categoryAr: product.categoryAr,
    light: isArabic && product.lightAr?.trim() ? product.lightAr : product.light,
    lightAr: product.lightAr,
    priceQar: product.priceQar,
    stock,
    inStock: stock > 0,
    image: image ?? null,
    media: product.media,
  };
}

function toDetail(
  product: PublicProductRecord,
  language: ProductQuery["lang"] = "en",
): ProductDetail {
  return {
    ...toSummary(product, language),
    description: language === "ar" && product.descriptionAr?.trim() ? product.descriptionAr : product.description,
    descriptionAr: product.descriptionAr,
    media: product.media,
  };
}

export async function listProducts(query: ProductQuery): Promise<{
  items: ProductSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}> {
  const where: PublicProductWhere = {
    published: true,
    ...(query.category ? { category: query.category } : {}),
    ...(query.light ? { light: query.light } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q } },
            { description: { contains: query.q } },
            { nameAr: { contains: query.q } },
            { descriptionAr: { contains: query.q } },
            { slug: { contains: query.q } },
          ],
        }
      : {}),
  };

  const orderBy: Parameters<ProductRepository["findMany"]>[0]["orderBy"] =
    query.sort === "price-asc"
    ? [{ priceQar: "asc" }, { slug: "asc" }]
    : query.sort === "price-desc"
      ? [{ priceQar: "desc" }, { slug: "asc" }]
      : [{ name: "asc" }, { slug: "asc" }];

  const [products, totalItems] = await Promise.all([
    productRepository.findMany({
      where,
      select: publicProductSelection,
      orderBy,
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    productRepository.count({ where }),
  ]);

  return {
    items: products.map((product) => toSummary(product, query.lang)),
    page: query.page,
    pageSize: PAGE_SIZE,
    totalItems,
    totalPages: Math.ceil(totalItems / PAGE_SIZE),
  };
}

export async function listProductFilters(language: ProductQuery["lang"] = "en"): Promise<{
  categories: string[];
  lights: string[];
  categoryLabels: Record<string, string>;
  lightLabels: Record<string, string>;
}> {
  const products = await productFilterRepository.findMany({
    where: { published: true },
    select: { category: true, categoryAr: true, light: true, lightAr: true },
  });

  return {
    categories: [...new Set(products.map((product) => language === "ar" && product.categoryAr?.trim() ? product.categoryAr : product.category))].sort(),
    lights: [...new Set(products.map((product) => language === "ar" && product.lightAr?.trim() ? product.lightAr : product.light))].sort(),
    categoryLabels: Object.fromEntries(products.flatMap((product) => product.categoryAr ? [[product.category, product.categoryAr]] : [])),
    lightLabels: Object.fromEntries(products.flatMap((product) => product.lightAr ? [[product.light, product.lightAr]] : [])),
  };
}

export async function findProductBySlug(
  slug: string,
  language: ProductQuery["lang"] = "en",
): Promise<ProductDetail | null> {
  const product = await productRepository.findFirst({
    where: { slug, published: true },
    select: publicProductSelection,
  });

  return product ? toDetail(product, language) : null;
}
