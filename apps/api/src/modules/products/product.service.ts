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
    select: { url: true, altText: true },
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
  media: Array<{ url: string; altText: string }>;
  inventory: { quantity: number } | null;
};

type TextFilter = { contains: string };

type ProductCondition = {
  category?: string;
  categoryAr?: string;
  light?: string;
  lightAr?: string;
  OR?: Array<{
    category?: string;
    categoryAr?: string;
    light?: string;
    lightAr?: string;
    name?: TextFilter;
    nameAr?: TextFilter;
    description?: TextFilter;
    descriptionAr?: TextFilter;
    slug?: TextFilter;
  }>;
};

type PublicProductWhere = {
  published: boolean;
  AND?: ProductCondition[];
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

const productRepository = prisma.product as unknown as ProductRepository;

type ProductFilterRepository = {
  findMany(args: {
    where: { published: boolean };
    select: { category: true; categoryAr: true; light: true; lightAr: true };
  }): Promise<Array<{ category: string; categoryAr: string | null; light: string; lightAr: string | null }>>;
};

const productFilterRepository = prisma.product as unknown as ProductFilterRepository;

function localizedValue(
  language: ProductQuery["lang"],
  english: string,
  arabic: string | null,
) {
  return language === "ar" && arabic?.trim() ? arabic : english;
}

function toSummary(product: PublicProductRecord, language: ProductQuery["lang"]): ProductSummary {
  const [image] = product.media;
  const stock = product.inventory?.quantity ?? 0;

  return {
    id: product.id,
    slug: product.slug,
    name: localizedValue(language, product.name, product.nameAr),
    category: localizedValue(language, product.category, product.categoryAr),
    light: localizedValue(language, product.light, product.lightAr),
    priceQar: product.priceQar,
    stock,
    inStock: stock > 0,
    image: image ?? null,
  };
}

function toDetail(product: PublicProductRecord, language: ProductQuery["lang"]): ProductDetail {
  return {
    ...toSummary(product, language),
    description: localizedValue(language, product.description, product.descriptionAr),
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
  const conditions: ProductCondition[] = [];
  if (query.category) {
    conditions.push(
      query.lang === "ar"
        ? { OR: [{ categoryAr: query.category }, { category: query.category }] }
        : { category: query.category },
    );
  }
  if (query.light) {
    conditions.push(
      query.lang === "ar"
        ? { OR: [{ lightAr: query.light }, { light: query.light }] }
        : { light: query.light },
    );
  }
  if (query.q) {
    conditions.push({
      OR: [
        { name: { contains: query.q } },
        { nameAr: { contains: query.q } },
        { description: { contains: query.q } },
        { descriptionAr: { contains: query.q } },
        { slug: { contains: query.q } },
      ],
    });
  }

  const where: PublicProductWhere = {
    published: true,
    ...(conditions.length ? { AND: conditions } : {}),
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
}> {
  const products = await productFilterRepository.findMany({
    where: { published: true },
    select: { category: true, categoryAr: true, light: true, lightAr: true },
  });

  return {
    categories: [...new Set(products.map((product) =>
      localizedValue(language, product.category, product.categoryAr),
    ))].sort((a, b) => a.localeCompare(b, language === "ar" ? "ar" : "en")),
    lights: [...new Set(products.map((product) =>
      localizedValue(language, product.light, product.lightAr),
    ))].sort((a, b) => a.localeCompare(b, language === "ar" ? "ar" : "en")),
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
