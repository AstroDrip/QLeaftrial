import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import type { CreateAdminProductInput, ReplaceProductImagesInput, UpdateAdminProductInput } from "./admin-product.schemas.js";
import { removeStoredProductImage, storagePathFromPublicUrl, storeProductImage } from "./product-image-storage.js";
import { finalizeProductImages, removeProductImagePaths } from "./product-upload.service.js";
import { regeneratePublicCatalogue } from "../../lib/catalogue.js";

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
  };
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

    // Rebuild the public catalogue after a product change so the customer
    // catalogue stays in sync. Failures here must not roll back the update.
    try {
      await regeneratePublicCatalogue();
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        endpoint: "/api/v1/admin/products/:id",
        event: "catalogue-regeneration-post-update-failed",
        error: error instanceof Error ? error.message : String(error),
      }));
    }

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

    // Rebuild the public catalogue after an admin product creation so the
    // customer catalogue stays in sync. A regeneration failure must not roll
    // back the product creation.
    try {
      await regeneratePublicCatalogue();
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        endpoint: "/api/v1/admin/products",
        event: "catalogue-regeneration-post-create-failed",
        error: error instanceof Error ? error.message : String(error),
      }));
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

  // Rebuild the public catalogue after an admin product deletion so the
  // customer catalogue stays in sync. A regeneration failure is logged but does
  // not change the (already-deleted) product state.
  try {
    await regeneratePublicCatalogue();
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      endpoint: "/api/v1/admin/products/:id",
      event: "catalogue-regeneration-post-delete-failed",
      error: error instanceof Error ? error.message : String(error),
    }));
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

  // Rebuild the public catalogue after an admin image replacement so the
  // customer catalogue stays in sync. A regeneration failure must not roll back
  // the image replacement.
  try {
    await regeneratePublicCatalogue();
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      endpoint: "/api/v1/admin/products/:id/images",
      event: "catalogue-regeneration-post-image-replace-failed",
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return toAdminProduct(product!);
}
