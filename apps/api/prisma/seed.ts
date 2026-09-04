import argon2 from "argon2";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/prisma.ts";

const products = [
  {
    slug: "house-plant",
    sku: "QL-HP-001",
    name: "House Plant",
    description: "A generous, glossy-leafed plant for bright living spaces.",
    category: "Indoor",
    light: "Bright indirect",
    priceQar: 180,
    costPrice: 90,
    quantity: 12,
    media: { url: "/media/plants/house-plant.jpg", altText: "House plant in a ceramic pot" },
  },
  {
    slug: "fiddle-leaf-fig",
    sku: "QL-FF-002",
    name: "Fiddle Leaf Fig",
    description: "Sculptural leaves that make a calm, vertical statement.",
    category: "Indoor",
    light: "Bright indirect",
    priceQar: 260,
    costPrice: 130,
    quantity: 8,
    media: { url: "/media/plants/fiddle-leaf-fig.jpg", altText: "Fiddle leaf fig by a window" },
  },
  {
    slug: "snake-plant",
    sku: "QL-SP-003",
    name: "Snake Plant",
    description: "An upright, resilient plant for low-maintenance corners.",
    category: "Indoor",
    light: "Low to bright indirect",
    priceQar: 120,
    costPrice: 55,
    quantity: 16,
    media: { url: "/media/plants/snake-plant.jpg", altText: "Snake plant in a woven basket" },
  },
  {
    slug: "monstera-deliciosa",
    sku: "QL-MD-004",
    name: "Monstera Deliciosa",
    description: "Split tropical leaves for a lush, layered interior.",
    category: "Indoor",
    light: "Medium indirect",
    priceQar: 220,
    costPrice: 105,
    quantity: 10,
    media: { url: "/media/plants/monstera-deliciosa.jpg", altText: "Monstera deliciosa in a terracotta pot" },
  },
  {
    slug: "aloe-vera",
    sku: "QL-AV-005",
    name: "Aloe Vera",
    description: "A useful, sun-loving succulent with architectural leaves.",
    category: "Succulent",
    light: "Direct sun",
    priceQar: 75,
    costPrice: 30,
    quantity: 20,
    media: { url: "/media/plants/aloe-vera.jpg", altText: "Aloe vera plant on a sunny shelf" },
  },
  {
    slug: "peace-lily",
    sku: "QL-PL-006",
    name: "Peace Lily",
    description: "Soft white blooms and deep foliage for quieter rooms.",
    category: "Indoor",
    light: "Low to medium indirect",
    priceQar: 145,
    costPrice: 65,
    quantity: 14,
    media: { url: "/media/plants/peace-lily.jpg", altText: "Peace lily with white blooms" },
  },
] as const;

export async function seedDatabase(): Promise<void> {
  for (const product of products) {
    const { media, quantity, ...productData } = product;

    await prisma.product.upsert({
      where: { slug: product.slug },
      create: {
        ...productData,
        published: true,
        inventory: { create: { quantity } },
        media: { create: { ...media, sortOrder: 0 } },
      },
      update: {
        ...productData,
        published: true,
        inventory: { upsert: { create: { quantity }, update: { quantity } } },
        media: {
          deleteMany: {},
          create: { ...media, sortOrder: 0 },
        },
      },
    });
  }

  const developmentAdmin = await prisma.adminUser.findUnique({
    where: { email: "admin@qleaves.local" },
  });
  const password = "taimuomar";
  const passwordHash = developmentAdmin && await argon2.verify(developmentAdmin.passwordHash, password)
    ? developmentAdmin.passwordHash
    : await argon2.hash(password);

  await prisma.adminUser.upsert({
    where: { email: "admin@qleaves.local" },
    create: {
      email: "admin@qleaves.local",
      name: "QLeaves Development Admin",
      passwordHash,
    },
    update: {
      name: "QLeaves Development Admin",
      passwordHash,
    },
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  seedDatabase()
    .then(() => prisma.$disconnect())
    .catch(async (error: unknown) => {
      await prisma.$disconnect();
      console.error(error);
      process.exitCode = 1;
    });
}
