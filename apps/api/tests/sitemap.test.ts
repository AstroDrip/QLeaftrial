import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { resetDatabase } from "./helpers";

async function product(slug: string, published: boolean, updatedAt: Date) {
  return prisma.product.create({
    data: {
      slug,
      sku: `SKU-${slug}`,
      name: slug,
      description: "A sitemap test product.",
      category: "Indoor",
      light: "Indirect",
      priceQar: 100,
      costPrice: 40,
      published,
      updatedAt,
    },
  });
}

describe("dynamic sitemap", () => {
  beforeEach(resetDatabase);
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  it("includes published products, excludes drafts, and escapes XML", async () => {
    await product("zebra-plant", true, new Date("2026-09-04T10:00:00.000Z"));
    await product("fern&fig", true, new Date("2026-09-03T10:00:00.000Z"));
    await product("draft-plant", false, new Date("2026-09-02T10:00:00.000Z"));

    const response = await request(createApp()).get("/sitemap.xml");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/xml/);
    expect(response.headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=3600");
    expect(response.text).toContain("https://qleaves.qa/plants/fern&amp;fig");
    expect(response.text).toContain("https://qleaves.qa/plants/zebra-plant");
    expect(response.text).not.toContain("draft-plant");
    expect(response.text.indexOf("fern&amp;fig")).toBeLessThan(response.text.indexOf("zebra-plant"));
    expect(response.text).toContain("2026-09-03T10:00:00.000Z");
  });

  it("returns a controlled XML 503 when the catalogue query fails", async () => {
    vi.spyOn(prisma.product, "findMany").mockRejectedValueOnce(new Error("database secret details"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(createApp()).get("/sitemap.xml");

    expect(response.status).toBe(503);
    expect(response.headers["content-type"]).toMatch(/^application\/xml/);
    expect(response.text).toContain("Sitemap temporarily unavailable");
    expect(response.text).not.toContain("database secret details");
  });
});
