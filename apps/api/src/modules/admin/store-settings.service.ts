import { prisma } from "../../lib/prisma.js";
import type { PrismaClient as SqlitePrismaClient } from "../../../generated/sqlite/index.js";

const db = prisma as unknown as SqlitePrismaClient;
const SETTINGS_ID = "storefront";

const settingsSelect = {
  orderingEnabled: true,
  commercialRegistration: true,
  ecommerceLicense: true,
  businessAddress: true,
  supportEmail: true,
  supportPhone: true,
  deliveryFeeQar: true,
} as const;

// Read with a single query; the row is only created the first time, because an upsert on every
// request costs a multi-statement transaction.
export async function getStoreSettings() {
  const existing = await db.storeSettings.findUnique({ where: { id: SETTINGS_ID }, select: settingsSelect });
  if (existing) return existing;
  return db.storeSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID }, update: {}, select: settingsSelect });
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
