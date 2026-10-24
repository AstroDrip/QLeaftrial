import { prisma } from "../../lib/prisma.js";
import type { PrismaClient as SqlitePrismaClient } from "../../../generated/sqlite/index.js";

const db = prisma as unknown as SqlitePrismaClient;
const SETTINGS_ID = "storefront";

export async function getStoreSettings() {
  return db.storeSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
    select: {
      orderingEnabled: true,
      commercialRegistration: true,
      ecommerceLicense: true,
      businessAddress: true,
      supportEmail: true,
      supportPhone: true,
      deliveryFeeQar: true,
    },
  });
}

export async function updateStoreSettings(
  updates: Partial<{
    orderingEnabled: boolean;
    commercialRegistration: string | null;
    ecommerceLicense: string | null;
    businessAddress: string | null;
    supportEmail: string | null;
    supportPhone: string | null;
    deliveryFeeQar: number | null;
  }>,
) {
  return db.storeSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...updates },
    update: updates,
    select: {
      orderingEnabled: true,
      commercialRegistration: true,
      ecommerceLicense: true,
      businessAddress: true,
      supportEmail: true,
      supportPhone: true,
      deliveryFeeQar: true,
    },
  });
}
