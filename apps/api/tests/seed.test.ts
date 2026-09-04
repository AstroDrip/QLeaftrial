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

  it("creates the plant catalogue and development admin", async () => {
    await seedDatabase();

    expect(await prisma.product.count()).toBeGreaterThanOrEqual(6);
    const housePlant = await prisma.product.findFirst({
      where: { slug: "house-plant" },
    });
    expect(housePlant).toMatchObject({
      slug: "house-plant",
      priceQar: 180,
      published: true,
    });
    expect(housePlant).not.toHaveProperty("arEnabled");
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

    expect(await argon2.verify(admin.passwordHash, "taimuomar")).toBe(true);
  });

  it("refuses to seed PostgreSQL with the known development password", async () => {
    const previousProvider = process.env.QLEAVES_DATABASE_PROVIDER;
    const previousSeedPassword = process.env.QLEAVES_ADMIN_SEED_PASSWORD;
    process.env.QLEAVES_DATABASE_PROVIDER = "postgresql";
    delete process.env.QLEAVES_ADMIN_SEED_PASSWORD;

    try {
      await expect(seedDatabase()).rejects.toThrow(
        "QLEAVES_ADMIN_SEED_PASSWORD is required when seeding PostgreSQL",
      );
    } finally {
      process.env.QLEAVES_DATABASE_PROVIDER = previousProvider;
      if (previousSeedPassword === undefined) {
        delete process.env.QLEAVES_ADMIN_SEED_PASSWORD;
      } else {
        process.env.QLEAVES_ADMIN_SEED_PASSWORD = previousSeedPassword;
      }
    }
  });

  it("rejects the known local password when it is explicitly supplied for PostgreSQL", async () => {
    const previousProvider = process.env.QLEAVES_DATABASE_PROVIDER;
    const previousSeedPassword = process.env.QLEAVES_ADMIN_SEED_PASSWORD;
    process.env.QLEAVES_DATABASE_PROVIDER = "postgresql";
    process.env.QLEAVES_ADMIN_SEED_PASSWORD = "taimuomar";

    try {
      await expect(seedDatabase()).rejects.toThrow(
        "must not use the known local development password",
      );
    } finally {
      process.env.QLEAVES_DATABASE_PROVIDER = previousProvider;
      if (previousSeedPassword === undefined) {
        delete process.env.QLEAVES_ADMIN_SEED_PASSWORD;
      } else {
        process.env.QLEAVES_ADMIN_SEED_PASSWORD = previousSeedPassword;
      }
    }
  });

  it("rejects a weak PostgreSQL seed password", async () => {
    const previousProvider = process.env.QLEAVES_DATABASE_PROVIDER;
    const previousSeedPassword = process.env.QLEAVES_ADMIN_SEED_PASSWORD;
    process.env.QLEAVES_DATABASE_PROVIDER = "postgresql";
    process.env.QLEAVES_ADMIN_SEED_PASSWORD = "too-short";

    try {
      await expect(seedDatabase()).rejects.toThrow(
        "must contain at least 12 characters",
      );
    } finally {
      process.env.QLEAVES_DATABASE_PROVIDER = previousProvider;
      if (previousSeedPassword === undefined) {
        delete process.env.QLEAVES_ADMIN_SEED_PASSWORD;
      } else {
        process.env.QLEAVES_ADMIN_SEED_PASSWORD = previousSeedPassword;
      }
    }
  });

  it("uses the operator-supplied password when seeding PostgreSQL", async () => {
    const previousProvider = process.env.QLEAVES_DATABASE_PROVIDER;
    const previousSeedPassword = process.env.QLEAVES_ADMIN_SEED_PASSWORD;
    process.env.QLEAVES_DATABASE_PROVIDER = "postgresql";
    process.env.QLEAVES_ADMIN_SEED_PASSWORD = "a-production-only-password";

    try {
      await seedDatabase();
      const admin = await prisma.adminUser.findUniqueOrThrow({
        where: { email: "admin@qleaves.local" },
      });
      expect(
        await argon2.verify(admin.passwordHash, "a-production-only-password"),
      ).toBe(true);
      expect(await argon2.verify(admin.passwordHash, "taimuomar")).toBe(false);
    } finally {
      process.env.QLEAVES_DATABASE_PROVIDER = previousProvider;
      if (previousSeedPassword === undefined) {
        delete process.env.QLEAVES_ADMIN_SEED_PASSWORD;
      } else {
        process.env.QLEAVES_ADMIN_SEED_PASSWORD = previousSeedPassword;
      }
    }
  });
});
