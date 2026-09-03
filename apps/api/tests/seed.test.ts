import argon2 from "argon2";
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

  it("restores the development password for an existing stale admin", async () => {
    await prisma.adminUser.create({
      data: {
        email: "admin@qleaves.local",
        name: "Stale Admin",
        passwordHash: await argon2.hash("not-the-demo-password"),
      },
    });

    await seedDatabase();

    const admin = await prisma.adminUser.findUniqueOrThrow({
      where: { email: "admin@qleaves.local" },
    });

    expect(await argon2.verify(admin.passwordHash, "QLeavesDemo123!")).toBe(true);
  });
});
