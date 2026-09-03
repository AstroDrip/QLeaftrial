import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { seedDatabase } from "../prisma/seed";

describe("seedDatabase", () => {
  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.adminUser.deleteMany();
  });

  afterAll(() => prisma.$disconnect());

  it("creates an AR-enabled plant and development admin", async () => {
    await seedDatabase();

    expect(await prisma.product.count()).toBeGreaterThanOrEqual(6);
    expect(
      await prisma.product.findFirst({ where: { slug: "house-plant" } }),
    ).toMatchObject({ arEnabled: true, priceQar: 180 });
    expect(
      await prisma.adminUser.findUnique({
        where: { email: "admin@qleaves.local" },
      }),
    ).not.toBeNull();
  });
});
