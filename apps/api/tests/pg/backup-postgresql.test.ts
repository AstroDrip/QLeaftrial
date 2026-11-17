import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { clearOrderRateLimit } from "../../src/modules/orders/order-rate-limit";
import { exportBackup, readBackup, restoreInto, writeBackup } from "../../scripts/backup";
import { loggedInAgent, resetDatabase, seededProduct, validOrder } from "../helpers";
import { PG_TEST_URL } from "./global-setup";

// Backup and restore drill on a real PostgreSQL: export the test database, restore it into a second empty
// database with the same migrations, and require every table to match exactly (rows and contents).
describe("backup and restore drill", () => {
  afterAll(() => prisma.$disconnect());

  it("restores every table exactly, Arabic text, dates, enums and JSON included", async () => {
    await (prisma as any).notificationOutbox.deleteMany();
    await resetDatabase();
    await clearOrderRateLimit();
    const product = await seededProduct("snake-plant");
    await prisma.product.update({ where: { id: product.id }, data: { nameAr: "نبتة الثعبان", humidity: "Average", heightCm: 90 } });
    const order = await request(createApp()).post("/api/v1/orders").set("Idempotency-Key", `pg-${crypto.randomUUID()}`)
      .send(validOrder({ customerName: "مريم", items: [{ productId: product.id, quantity: 1 }] }));
    expect(order.status).toBe(201);
    await loggedInAgent();

    const backup = await exportBackup(PG_TEST_URL);
    expect(backup.tables.Order.rows).toBe(1);
    expect(backup.tables._prisma_migrations.rows).toBeGreaterThan(10);
    const directory = mkdtempSync(join(tmpdir(), "qleaves-backup-test-"));
    const file = join(directory, "backup.json.gz");
    writeBackup(file, backup);

    const admin = new pg.Client({ connectionString: PG_TEST_URL });
    await admin.connect();
    await admin.query("drop database if exists qleaves_restore_test");
    await admin.query("create database qleaves_restore_test");
    await admin.end();
    const target = PG_TEST_URL.replace(/\/[^/]+$/, "/qleaves_restore_test");
    try {
      execFileSync(process.execPath, ["scripts/prisma.mjs", "migrate", "deploy", "--schema", "prisma/postgresql/schema.prisma"], {
        cwd: fileURLToPath(new URL("../..", import.meta.url)), env: { ...process.env, DATABASE_URL: target, DIRECT_URL: target }, stdio: "pipe",
      });
      const result = await restoreInto(target, readBackup(file));
      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);

      const check = new pg.Client({ connectionString: target });
      await check.connect();
      const restored = await check.query(`select "customerName" from "Order"`);
      const plant = await check.query(`select "nameAr", "heightCm" from "Product" where id = $1`, [product.id]);
      await check.end();
      expect(restored.rows[0].customerName).toBe("مريم");
      expect(plant.rows[0]).toEqual({ nameAr: "نبتة الثعبان", heightCm: 90 });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
