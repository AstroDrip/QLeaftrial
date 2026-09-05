import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import type { CreateAdminProductInput, UpdateAdminProductInput } from "./admin-product.schemas.js";
import { removeStoredProductImage, storeProductImage } from "./product-image-storage.js";

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
      nameAr?: string;
      description: string;
      descriptionAr?: string;
      category: string;
      categoryAr?: string;
      light: string;
      lightAr?: string;
      priceQar: number;
      costPrice: number;
      published: boolean;
      inventory: { create: { quantity: number } };
      media: { create: { url: string; altText: string; sortOrder: number } };
    };
    select: typeof adminProductSelection;
  }): Promise<AdminProductRecord>;
};

type ProductUpdateData = {
  priceQar?: number;
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

    const productPatch: ProductUpdateData = {
      ...(input.priceQar !== undefined ? { priceQar: input.priceQar } : {}),
      ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
      ...(input.descriptionAr !== undefined ? { descriptionAr: input.descriptionAr } : {}),
      ...(input.categoryAr !== undefined ? { categoryAr: input.categoryAr } : {}),
      ...(input.lightAr !== undefined ? { lightAr: input.lightAr } : {}),
    };

    const product = Object.keys(productPatch).length === 0
      ? existing
      : await transaction.product.update({
          where: { id },
          data: productPatch,
          select: adminProductSelection,
        });

    const inventory = input.stock === undefined
      ? product.inventory
      : await transaction.inventory.upsert({
          where: { productId: id },
          create: { productId: id, quantity: input.stock },
          update: { quantity: input.stock },
          select: { quantity: true },
        });

    return toAdminProduct({
      ...product,
      inventory,
    });
  });
}

export async function createAdminProduct(input: CreateAdminProductInput): Promise<AdminProduct> {
  const storedImage = await storeProductImage(input.imageDataUrl, input.slug);

  try {
    const product = await productCreateRepository.create({
      data: {
        slug: input.slug,
        sku: input.sku,
        name: input.name,
        ...(input.nameAr ? { nameAr: input.nameAr } : {}),
        description: input.description,
        ...(input.descriptionAr ? { descriptionAr: input.descriptionAr } : {}),
        category: input.category,
        ...(input.categoryAr ? { categoryAr: input.categoryAr } : {}),
        light: input.light,
        ...(input.lightAr ? { lightAr: input.lightAr } : {}),
        priceQar: input.priceQar,
        costPrice: input.costPrice,
        published: true,
        inventory: { create: { quantity: input.stock } },
        media: { create: { url: storedImage.url, altText: input.imageAltText, sortOrder: 0 } },
      },
      select: adminProductSelection,
    });
    return toAdminProduct(product);
  } catch (error) {
    try {
      await removeStoredProductImage(storedImage);
    } catch (cleanupError) {
      console.error("Failed to clean up product image after product creation failed", cleanupError);
    }
    throw error;
  }
}
