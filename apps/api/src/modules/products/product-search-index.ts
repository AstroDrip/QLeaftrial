import { prisma } from "../../lib/prisma.js";
import { buildProductSearchIndex, searchProductIndex, type ProductSearchIndex, type SearchableProduct, type SearchHit } from "../../lib/product-search.js";

// The search index over published products, built from the database and reused until the published products
// change. Each search first asks the database one tiny question (how many published products, and when the
// latest was changed); only when that answer differs is the index rebuilt. Only the searchable text is read,
// and none of it is sent to customers.

type SearchSourceRepository = {
  findMany(args: {
    where: { published: boolean };
    select: Record<keyof SearchableProduct, true>;
  }): Promise<SearchableProduct[]>;
  aggregate(args: { where: { published: boolean }; _count: { _all: true }; _max: { updatedAt: true } }): Promise<{ _count: { _all: number }; _max: { updatedAt: Date | null } }>;
};
const searchSource = prisma.product as unknown as SearchSourceRepository;

let cached: { index: ProductSearchIndex; version: string } | null = null;
let building: { promise: Promise<ProductSearchIndex>; version: string } | null = null;

export function invalidateProductSearchIndex(): void {
  cached = null;
}

async function currentIndex(): Promise<ProductSearchIndex> {
  const stats = await searchSource.aggregate({ where: { published: true }, _count: { _all: true }, _max: { updatedAt: true } });
  const version = `${stats._count._all}:${stats._max.updatedAt?.getTime() ?? 0}`;
  if (cached?.version === version) return cached.index;
  if (building?.version === version) return building.promise;
  const promise = searchSource
    .findMany({
      where: { published: true },
      select: { id: true, name: true, nameAr: true, scientificName: true, searchAliases: true, category: true, categoryAr: true, description: true, descriptionAr: true, slug: true },
    })
    .then((products) => {
      const index = buildProductSearchIndex(products);
      cached = { index, version };
      return index;
    })
    .finally(() => {
      if (building?.promise === promise) building = null;
    });
  building = { promise, version };
  return promise;
}

export async function searchPublishedProducts(query: string): Promise<SearchHit[]> {
  return searchProductIndex(await currentIndex(), query);
}
