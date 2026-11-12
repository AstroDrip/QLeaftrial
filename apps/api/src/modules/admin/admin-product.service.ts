import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import type { CreateAdminProductInput, ReplaceProductImagesInput, UpdateAdminProductInput } from "./admin-product.schemas.js";
import { removeStoredProductImage, storagePathFromPublicUrl, storeProductImage } from "./product-image-storage.js";
import { finalizeProductImages, removeProductImagePaths } from "./product-upload.service.js";

const adminProductSelection = {
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
  costPrice: true,
  published: true,
  compareAtPriceQar: true,
  featured: true,
  scientificName: true,
  watering: true,
  wateringAr: true,
  careLevel: true,
  placement: true,
  needsReview: true,
  reviewNote: true,
  searchAliases: true,
  media: {
    select: { url: true, altText: true },
    orderBy: { sortOrder: "asc" },
    take: 1,
  },
  inventory: { select: { quantity: true } },
} as const;

type AdminProductRecord = {
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
  costPrice: number;
  published: boolean;
  compareAtPriceQar: number | null;
  featured: boolean;
  scientificName: string | null;
  watering: string | null;
  wateringAr: string | null;
  careLevel: string | null;
  placement: string | null;
  needsReview: boolean;
  reviewNote: string | null;
  searchAliases: string | null;
  media: Array<{ url: string; altText: string }>;
  inventory: { quantity: number } | null;
};

export type AdminProduct = {
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
  costPrice: number;
  stock: number;
  image: { url: string; altText: string } | null;
  published: boolean;
  compareAtPriceQar: number | null;
  featured: boolean;
  scientificName: string | null;
  watering: string | null;
  wateringAr: string | null;
  careLevel: string | null;
  placement: string | null;
  needsReview: boolean;
  reviewNote: string | null;
  searchAliases: string | null;
};

type AdminProductRepository = {
  findMany(args: {
    select: typeof adminProductSelection;
    orderBy: { name: "asc" };
  }): Promise<AdminProductRecord[]>;
};

type AdminProductCreateRepository = {
  create(args: {
    data: {
      slug: string;
      sku: string;
      name: string;
      nameAr?: string;
      description: string;
      descriptionAr?: string;
      category: string;
      categoryAr?: string;
      light?: string;
      lightAr?: string;
      priceQar: number;
      costPrice: number;
      published: boolean;
      compareAtPriceQar?: number | null;
      featured?: boolean;
      scientificName?: string | null;
      watering?: string | null;
      wateringAr?: string | null;
      careLevel?: string | null;
      placement?: string | null;
      needsReview?: boolean;
      reviewNote?: string | null;
      searchAliases?: string | null;
      inventory: { create: { quantity: number } };
      media: { create: Array<{
        url: string;
        altText: string;
        sortOrder: number;
        width?: number;
        height?: number;
        purpose?: string;
      }> };
    };
    select: typeof adminProductSelection;
  }): Promise<AdminProductRecord>;
};

type ProductUpdateData = {
  priceQar?: number;
  costPrice?: number;
  published?: boolean;
  name?: string;
  description?: string;
  category?: string;
  light?: string | null;
  nameAr?: string;
  descriptionAr?: string;
  categoryAr?: string;
  lightAr?: string;
  compareAtPriceQar?: number | null;
  featured?: boolean;
  scientificName?: string | null;
  watering?: string | null;
  wateringAr?: string | null;
  careLevel?: string | null;
  placement?: string | null;
  needsReview?: boolean;
  reviewNote?: string | null;
  searchAliases?: string | null;
};

type TransactionClient = {
  product: {
    findUnique(args: {
      where: { id: string };
      select: typeof adminProductSelection;
    }): Promise<AdminProductRecord | null>;
    update(args: {
      where: { id: string };
      data: ProductUpdateData;
      select: typeof adminProductSelection;
    }): Promise<AdminProductRecord>;
  };
  inventory: {
    findUnique(args: {
      where: { productId: string };
      select: { quantity: true };
    }): Promise<{ quantity: number } | null>;
    upsert(args: {
      where: { productId: string };
      create: { productId: string; quantity: number };
      update: { quantity: number };
      select: { quantity: true };
    }): Promise<{ quantity: number }>;
  };
};

type TransactionDatabase = {
  $transaction<T>(operation: (transaction: TransactionClient) => Promise<T>): Promise<T>;
};

const productRepository = prisma.product as unknown as AdminProductRepository;
const productCreateRepository = prisma.product as unknown as AdminProductCreateRepository;
const transactionDatabase = prisma as unknown as TransactionDatabase;

type AdminProductDeleteRepository = {
  findUnique(args: { where: { id: string }; select: { id: true } }): Promise<{ id: string } | null>;
  delete(args: { where: { id: string } }): Promise<{ id: string }>;
};

const productDeleteRepository = prisma.product as unknown as AdminProductDeleteRepository;
const orderItemRepository = prisma.orderItem as unknown as {
  count(args: { where: { productId: string } }): Promise<number>;
};

function toAdminProduct(product: AdminProductRecord): AdminProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    nameAr: product.nameAr,
    description: product.description,
    descriptionAr: product.descriptionAr,
    category: product.category,
    categoryAr: product.categoryAr,
    light: product.light,
    lightAr: product.lightAr,
    priceQar: product.priceQar,
    costPrice: product.costPrice,
    stock: product.inventory?.quantity ?? 0,
    image: product.media[0] ?? null,
    published: product.published,
    compareAtPriceQar: product.compareAtPriceQar,
    featured: product.featured,
    scientificName: product.scientificName,
    watering: product.watering,
    wateringAr: product.wateringAr,
    careLevel: product.careLevel,
    placement: product.placement,
    needsReview: product.needsReview,
    reviewNote: product.reviewNote,
    searchAliases: product.searchAliases,
  };
}

// A listing customers can buy must have a real price; a "was" price only makes sense above the current one.
function assertSellable(state: { published: boolean; priceQar: number; compareAtPriceQar: number | null | undefined }): void {
  if (state.published && state.priceQar <= 0) {
    throw new ApiError(400, "PRICE_REQUIRED", "Set a price above 0 QAR before publishing this product");
  }
  if (state.compareAtPriceQar != null && state.compareAtPriceQar <= state.priceQar) {
    throw new ApiError(400, "INVALID_COMPARE_AT_PRICE", "The original price must be higher than the current price");
  }
}

export async function listAdminProducts(): Promise<AdminProduct[]> {
  const products = await productRepository.findMany({
    select: adminProductSelection,
    orderBy: { name: "asc" },
  });
  return products.map(toAdminProduct);
}

export async function updateAdminProduct(
  id: string,
  input: UpdateAdminProductInput,
): Promise<AdminProduct> {
  return transactionDatabase.$transaction(async (transaction) => {
    const existing = await transaction.product.findUnique({
      where: { id },
      select: adminProductSelection,
    });
    if (!existing) {
      throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    const { stock: _stock, ...requested } = input;
    const productFields = Object.fromEntries(
      Object.entries(requested).filter(([, value]) => value !== undefined),
    ) as ProductUpdateData;
    assertSellable({
      published: productFields.published ?? existing.published,
      priceQar: productFields.priceQar ?? existing.priceQar,
      compareAtPriceQar: productFields.compareAtPriceQar !== undefined ? productFields.compareAtPriceQar : existing.compareAtPriceQar,
    });

    const product = Object.keys(productFields).length === 0
      ? existing
      : await transaction.product.update({
          where: { id },
          data: productFields,
          select: adminProductSelection,
        });

    const inventory = input.stock === undefined
      ? await transaction.inventory.findUnique({
          where: { productId: id },
          select: { quantity: true },
        })
      : await transaction.inventory.upsert({
          where: { productId: id },
          create: { productId: id, quantity: input.stock },
          update: { quantity: input.stock },
          select: { quantity: true },
        });

    return toAdminProduct({ ...product, inventory });
  });
}

type MediaRow = {
  url: string;
  altText: string;
  sortOrder: number;
  width?: number;
  height?: number;
  purpose?: string;
};

// Catalogue variant first, so list views (which take the first image) get the small one.
function mediaRows(
  finalizedImages: Awaited<ReturnType<typeof finalizeProductImages>>,
  legacyImage: { url: string } | undefined,
  altText: string,
): MediaRow[] {
  if (finalizedImages.length === 0) return [{ url: legacyImage!.url, altText, sortOrder: 0 }];
  return [...finalizedImages]
    .sort((left, right) => left.purpose === "catalog" ? -1 : right.purpose === "catalog" ? 1 : 0)
    .map((image, sortOrder) => ({
      url: image.url,
      altText,
      sortOrder,
      width: image.width,
      height: image.height,
      purpose: image.purpose,
    }));
}

export async function createAdminProduct(input: CreateAdminProductInput): Promise<AdminProduct> {
  assertSellable({ published: true, priceQar: input.priceQar, compareAtPriceQar: input.compareAtPriceQar });
  const usesPostgreSql = process.env.QLEAVES_DATABASE_PROVIDER === "postgresql";
  if (usesPostgreSql && input.imageDataUrl) {
    throw new ApiError(400, "VALIDATION_ERROR", "Production product creation requires staged image variants");
  }

  const stagedPaths = input.stagedImages?.map((image) => image.stagingPath) ?? [];
  const finalizedImages = input.stagedImages
    ? await finalizeProductImages(input.stagedImages, input.slug)
    : [];
  const legacyImage = input.imageDataUrl
    ? await storeProductImage(input.imageDataUrl, input.slug)
    : undefined;
  const finalStoragePaths = finalizedImages.map((image) => image.storagePath);

  try {
    const product = await productCreateRepository.create({
      data: {
        slug: input.slug,
        sku: input.sku,
        name: input.name,
        ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
        description: input.description,
        ...(input.descriptionAr !== undefined ? { descriptionAr: input.descriptionAr } : {}),
        category: input.category,
        ...(input.categoryAr !== undefined ? { categoryAr: input.categoryAr } : {}),
        ...(input.light !== undefined ? { light: input.light } : {}),
        ...(input.lightAr !== undefined ? { lightAr: input.lightAr } : {}),
        priceQar: input.priceQar,
        costPrice: input.costPrice,
        published: true,
        ...Object.fromEntries(
          (["compareAtPriceQar", "featured", "scientificName", "watering", "wateringAr", "careLevel", "placement", "needsReview", "reviewNote", "searchAliases"] as const)
            .filter((key) => input[key] !== undefined)
            .map((key) => [key, input[key]]),
        ),
        inventory: { create: { quantity: input.stock } },
        media: {
          create: mediaRows(finalizedImages, legacyImage, input.imageAltText),
        },
      },
      select: adminProductSelection,
    });

    if (stagedPaths.length > 0) {
      try {
        await removeProductImagePaths(stagedPaths);
      } catch (cleanupError) {
        console.error(JSON.stringify({
          level: "error",
          event: "staged-product-image-cleanup-failed",
          errorType: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
        }));
      }
    }
    return toAdminProduct(product);
  } catch (error) {
    if (finalStoragePaths.length > 0) {
      await Promise.allSettled([removeProductImagePaths(finalStoragePaths)]);
    }
    if (legacyImage) {
      try {
        await removeStoredProductImage(legacyImage);
      } catch (cleanupError) {
        console.error(JSON.stringify({
          level: "error",
          event: "legacy-product-image-cleanup-failed",
          errorType: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
        }));
      }
    }
    throw error;
  }
}

function productHasOrders(): ApiError {
  return new ApiError(
    409,
    "PRODUCT_HAS_ORDERS",
    "This product appears in existing orders and cannot be deleted. Unpublish it instead",
  );
}

export async function deleteAdminProduct(id: string): Promise<void> {
  const existing = await productDeleteRepository.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }
  // Order lines keep sales history, so products referenced by orders are only unpublished.
  if (await orderItemRepository.count({ where: { productId: id } }) > 0) {
    throw productHasOrders();
  }
  try {
    await productDeleteRepository.delete({ where: { id } });
  } catch (error) {
    // An order placed between the check and the delete trips the Restrict foreign key.
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "P2003") {
      throw productHasOrders();
    }
    throw error;
  }
}

type MediaReplaceDatabase = {
  product: { findUnique(args: { where: { id: string }; select: { slug: true; media: { select: { url: true } } } }): Promise<{ slug: string; media: Array<{ url: string }> } | null> };
  $transaction<T>(operation: (transaction: {
    productMedia: {
      deleteMany(args: { where: { productId: string } }): Promise<unknown>;
      createMany(args: { data: Array<MediaRow & { productId: string }> }): Promise<unknown>;
    };
    product: { findUnique(args: { where: { id: string }; select: typeof adminProductSelection }): Promise<AdminProductRecord | null> };
  }) => Promise<T>): Promise<T>;
};

const mediaDatabase = prisma as unknown as MediaReplaceDatabase;

export async function replaceAdminProductImages(id: string, input: ReplaceProductImagesInput): Promise<AdminProduct> {
  if (process.env.QLEAVES_DATABASE_PROVIDER === "postgresql" && input.imageDataUrl) {
    throw new ApiError(400, "VALIDATION_ERROR", "Production image replacement requires staged image variants");
  }
  const existing = await mediaDatabase.product.findUnique({
    where: { id },
    select: { slug: true, media: { select: { url: true } } },
  });
  if (!existing) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");

  const finalizedImages = input.stagedImages ? await finalizeProductImages(input.stagedImages, existing.slug) : [];
  const legacyImage = input.imageDataUrl ? await storeProductImage(input.imageDataUrl, existing.slug) : undefined;

  let product: AdminProductRecord | null;
  try {
    product = await mediaDatabase.$transaction(async (transaction) => {
      await transaction.productMedia.deleteMany({ where: { productId: id } });
      await transaction.productMedia.createMany({
        data: mediaRows(finalizedImages, legacyImage, input.imageAltText).map((row) => ({ ...row, productId: id })),
      });
      return transaction.product.findUnique({ where: { id }, select: adminProductSelection });
    });
  } catch (error) {
    await Promise.allSettled([
      removeProductImagePaths(finalizedImages.map((image) => image.storagePath)),
      ...(legacyImage ? [removeStoredProductImage(legacyImage)] : []),
    ]);
    throw error;
  }

  // The new photos are saved; old files and staging copies are best-effort cleanup.
  const obsolete = [
    ...existing.media.map((media) => storagePathFromPublicUrl(media.url)).filter((path): path is string => Boolean(path)),
    ...(input.stagedImages?.map((image) => image.stagingPath) ?? []),
  ];
  if (obsolete.length > 0) {
    try {
      await removeProductImagePaths(obsolete);
    } catch (cleanupError) {
      console.error(JSON.stringify({
        level: "error",
        event: "replaced-product-image-cleanup-failed",
        errorType: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
      }));
    }
  }
  return toAdminProduct(product!);
}
