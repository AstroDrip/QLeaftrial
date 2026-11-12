import { prisma } from "../../lib/prisma.js";
import type { ProductDetail, ProductQuery, ProductSummary } from "./product.schemas.js";
import { searchPublishedProducts } from "./product-search-index.js";

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
  compareAtPriceQar: true,
  featured: true,
  scientificName: true,
  watering: true,
  wateringAr: true,
  careLevel: true,
  placement: true,
  createdAt: true,
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
  light: string | null;
  lightAr: string | null;
  priceQar: number;
  compareAtPriceQar: number | null;
  featured: boolean;
  scientificName: string | null;
  watering: string | null;
  wateringAr: string | null;
  careLevel: string | null;
  placement: string | null;
  createdAt: Date;
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
  priceQar?: { gte?: number; lte?: number };
  inventory?: { is: { quantity: { gt: number } } };
  featured?: boolean;
  id?: { in: string[] };
};

type ProductRepository = {
  findMany(args: {
    where: PublicProductWhere;
    select: typeof publicProductSelection;
    orderBy: Array<
      | { name: "asc" }
      | { priceQar: "asc" | "desc" }
      | { slug: "asc" }
      | { createdAt: "desc" }
      | { featured: "desc" }
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

type ProductIdRepository = {
  findMany(args: { where: PublicProductWhere; select: { id: true } }): Promise<Array<{ id: string }>>;
};
const productIdRepository = prisma.product as unknown as ProductIdRepository;

// SQLite and PostgreSQL clients share this generated Product delegate shape,
// but TypeScript cannot call generic methods through their runtime union.
const productRepository = prisma.product as unknown as ProductRepository;

type ProductFilterRepository = {
  findMany(args: {
    where: { published: boolean };
    select: { category: true; categoryAr: true; light: true; lightAr: true };
  }): Promise<Array<{ category: string; categoryAr: string | null; light: string | null; lightAr: string | null }>>;
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
    compareAtPriceQar: product.compareAtPriceQar && product.compareAtPriceQar > product.priceQar ? product.compareAtPriceQar : null,
    featured: product.featured,
    scientificName: product.scientificName,
    careLevel: product.careLevel,
    placement: product.placement,
    createdAt: product.createdAt.toISOString(),
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
    watering: language === "ar" && product.wateringAr?.trim() ? product.wateringAr : product.watering,
    wateringAr: product.wateringAr,
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
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? { priceQar: { ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}), ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}) } }
      : {}),
    ...(query.inStock ? { inventory: { is: { quantity: { gt: 0 } } } } : {}),
    ...(query.featured ? { featured: true } : {}),
  };

  // Search: names, aliases, botanical names, categories and descriptions in both languages, ranked by how well
  // they match (see lib/product-search.ts). The other filters still apply on top.
  const hits = query.q ? await searchPublishedProducts(query.q) : null;
  if (hits) {
    if (hits.length === 0) return { items: [], page: query.page, pageSize: PAGE_SIZE, totalItems: 0, totalPages: 0 };
    where.id = { in: hits.map((hit) => hit.id) };
  }
  // With a search, results come best match first unless the customer chose another order.
  const sort = query.sort ?? (hits ? "relevance" : "newest");

  if (hits && sort === "relevance") {
    const allowed = new Set((await productIdRepository.findMany({ where, select: { id: true } })).map((row) => row.id));
    const ranked = hits.filter((hit) => allowed.has(hit.id)).map((hit) => hit.id);
    const pageIds = ranked.slice((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE);
    const records = pageIds.length
      ? await productRepository.findMany({ where: { published: true, id: { in: pageIds } }, select: publicProductSelection, orderBy: [{ slug: "asc" }], skip: 0, take: PAGE_SIZE })
      : [];
    const byId = new Map(records.map((record) => [record.id, record]));
    return {
      items: pageIds.flatMap((id) => byId.get(id) ?? []).map((product) => toSummary(product, query.lang)),
      page: query.page,
      pageSize: PAGE_SIZE,
      totalItems: ranked.length,
      totalPages: Math.ceil(ranked.length / PAGE_SIZE),
    };
  }

  const orderBy: Parameters<ProductRepository["findMany"]>[0]["orderBy"] =
    sort === "price-asc"
    ? [{ priceQar: "asc" }, { slug: "asc" }]
    : sort === "price-desc"
      ? [{ priceQar: "desc" }, { slug: "asc" }]
      : sort === "featured"
        ? [{ featured: "desc" }, { createdAt: "desc" }, { slug: "asc" }]
        : sort === "name-asc"
          ? [{ name: "asc" }, { slug: "asc" }]
          : [{ createdAt: "desc" }, { slug: "asc" }];

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
  categoryCounts: Record<string, number>;
}> {
  const products = await productFilterRepository.findMany({
    where: { published: true },
    select: { category: true, categoryAr: true, light: true, lightAr: true },
  });
  const label = (value: string, arabic: string | null) => language === "ar" && arabic?.trim() ? arabic : value;
  const categoryCounts: Record<string, number> = {};
  for (const product of products) categoryCounts[product.category] = (categoryCounts[product.category] ?? 0) + 1;

  return {
    categories: [...new Set(products.map((product) => label(product.category, product.categoryAr)))].sort(),
    lights: [...new Set(products.flatMap((product) => product.light ? [label(product.light, product.lightAr)] : []))].sort(),
    categoryLabels: Object.fromEntries(products.flatMap((product) => product.categoryAr ? [[product.category, product.categoryAr]] : [])),
    lightLabels: Object.fromEntries(products.flatMap((product) => product.light && product.lightAr ? [[product.light, product.lightAr]] : [])),
    categoryCounts,
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
