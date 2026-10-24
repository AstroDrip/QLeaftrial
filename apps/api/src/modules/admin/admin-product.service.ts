import { prisma } from "../../lib/prisma.js";
import { ApiError } from "../../middleware/error-handler.js";
import type { CreateAdminProductInput, UpdateAdminProductInput } from "./admin-product.schemas.js";
import { removeStoredProductImage, storeProductImage } from "./product-image-storage.js";

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
  light: string;
  lightAr: string | null;
  priceQar: number;
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
  light: string;
  lightAr: string | null;
  priceQar: number;
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
  published?: boolean;
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

    const productPatch: ProductUpdateData = {
      ...(input.priceQar !== undefined ? { priceQar: input.priceQar } : {}),
      ...(input.published !== undefined ? { published: input.published } : {}),
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

export async function deleteAdminProduct(id: string): Promise<void> {
  const existing = await productDeleteRepository.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }
  await productDeleteRepository.delete({ where: { id } });
}
