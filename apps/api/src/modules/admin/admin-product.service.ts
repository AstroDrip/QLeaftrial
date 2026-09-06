import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import type { CreateAdminProductInput, UpdateAdminProductInput } from "./admin-product.schemas.js";
import { removeStoredProductImage, storeProductImage } from "./product-image-storage.js";
import { finalizeProductImages, removeProductImagePaths } from "./product-upload.service.js";

const adminProductSelection = {
  id: true,
  slug: true,
  name: true,
  nameAr: true,
  descriptionAr: true,
  categoryAr: true,
  lightAr: true,
  priceQar: true,
  inventory: { select: { quantity: true } },
} as const;

type AdminProductRecord = {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  descriptionAr: string | null;
  categoryAr: string | null;
  lightAr: string | null;
  priceQar: number;
  inventory: { quantity: number } | null;
};

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  descriptionAr: string | null;
  categoryAr: string | null;
  lightAr: string | null;
  priceQar: number;
  stock: number;
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
      nameAr: string;
      description: string;
      descriptionAr: string;
      category: string;
      categoryAr: string;
      light: string;
      lightAr: string;
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

type TransactionClient = {
  product: {
    findUnique(args: {
      where: { id: string };
      select: typeof adminProductSelection;
    }): Promise<AdminProductRecord | null>;
    update(args: {
      where: { id: string };
      data: { priceQar?: number; nameAr?: string; descriptionAr?: string; categoryAr?: string; lightAr?: string };
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

function toAdminProduct(product: AdminProductRecord): AdminProduct {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    nameAr: product.nameAr,
    descriptionAr: product.descriptionAr,
    categoryAr: product.categoryAr,
    lightAr: product.lightAr,
    priceQar: product.priceQar,
    stock: product.inventory?.quantity ?? 0,
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

    const productFields = {
      ...(input.priceQar !== undefined ? { priceQar: input.priceQar } : {}),
      ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
      ...(input.descriptionAr !== undefined ? { descriptionAr: input.descriptionAr } : {}),
      ...(input.categoryAr !== undefined ? { categoryAr: input.categoryAr } : {}),
      ...(input.lightAr !== undefined ? { lightAr: input.lightAr } : {}),
    };
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

    return {
      ...product,
      stock: inventory?.quantity ?? 0,
    };
  });
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
        nameAr: input.nameAr,
        description: input.description,
        descriptionAr: input.descriptionAr,
        category: input.category,
        categoryAr: input.categoryAr,
        light: input.light,
        lightAr: input.lightAr,
        priceQar: input.priceQar,
        costPrice: input.costPrice,
        published: true,
        inventory: { create: { quantity: input.stock } },
        media: {
          create: finalizedImages.length > 0
            ? finalizedImages
                .sort((left, right) => left.purpose === "catalog" ? -1 : right.purpose === "catalog" ? 1 : 0)
                .map((image, sortOrder) => ({
                  url: image.url,
                  altText: input.imageAltText,
                  sortOrder,
                  width: image.width,
                  height: image.height,
                  purpose: image.purpose,
                }))
            : [{ url: legacyImage!.url, altText: input.imageAltText, sortOrder: 0 }],
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
