import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { seedDatabase } from "../prisma/seed";

type ValidOrder = {
  customerName: string;
  phone: string;
  email: string;
  addressLine1: string;
  area: string;
  deliveryNotes?: string;
  paymentMethod: "COD" | "PAYMENT_LINK";
  items: Array<{ productId: string; quantity: number; unitPriceQar?: number }>;
};

export async function resetDatabase(): Promise<void> {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.adminUser.deleteMany();
}

export async function seededProduct(slug: string) {
  await seedDatabase();
  const product = await prisma.product.findUnique({ where: { slug } });

  if (!product) {
    throw new Error(`Seeded product not found: ${slug}`);
  }

  return product;
}

export async function inventoryFor(productId: string) {
  const inventory = await prisma.inventory.findUnique({ where: { productId } });

  if (!inventory) {
    throw new Error(`Inventory not found for product: ${productId}`);
  }

  return inventory;
}

export function validOrder(overrides: Partial<ValidOrder> = {}): ValidOrder {
  return {
    customerName: "Aisha Al-Mansoori",
    phone: "+974 5555 1234",
    email: "aisha@example.com",
    addressLine1: "12 Palm Street",
    area: "The Pearl",
    paymentMethod: "COD",
    items: [],
    ...overrides,
  };
}

export async function loggedInAgent() {
  await seedDatabase();
  const agent = request.agent(createApp());
  const response = await agent.post("/api/v1/auth/login").send({
    password: "taimuomar",
  });

  if (response.status !== 200) {
    throw new Error(`Development admin login failed with status ${response.status}`);
  }

  return agent;
}
