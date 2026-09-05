import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { validateStagedImage } from "../src/modules/admin/product-upload.service";
import { loggedInAgent, resetDatabase } from "./helpers";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=",
  "base64",
);

const stagedImage = {
  stagingPath: "products/staging/550e8400-e29b-41d4-a716-446655440000/catalog.png",
  purpose: "catalog" as const,
  contentType: "image/png" as const,
  byteSize: ONE_PIXEL_PNG.length,
  width: 1,
  height: 1,
};

const stagedImages = [
  stagedImage,
  {
    ...stagedImage,
    stagingPath: "products/staging/6ba7b810-9dad-41d1-80b4-00c04fd430c8/detail.png",
    purpose: "detail" as const,
  },
];

const newProduct = {
  name: "Direct Fern",
  slug: "direct-fern",
  sku: "QL-DF-100",
  description: "A production-ready fern with responsive images.",
  category: "Indoor",
  light: "Low indirect",
  priceQar: 110,
  costPrice: 45,
  stock: 6,
  imageAltText: "Direct fern in an olive planter",
};

describe("signed product uploads", () => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await resetDatabase();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_must_never_leave_server");
    vi.stubEnv("SUPABASE_PRODUCT_IMAGE_BUCKET", "product-images");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  });

  it("requires an authenticated administrator", async () => {
    const response = await request(createApp())
      .post("/api/v1/admin/product-uploads")
      .send({ purpose: "catalog", contentType: "image/webp", byteSize: 1000, width: 640, height: 480 });

    expect(response.status).toBe(401);
  });

  it("authorizes a random short-lived upload without returning the server key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      url: "/storage/v1/object/upload/sign/product-images/products/staging/random/catalog.webp?token=signed_upload_token",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await (await loggedInAgent())
      .post("/api/v1/admin/product-uploads")
      .send({ purpose: "catalog", contentType: "image/webp", byteSize: 1000, width: 640, height: 480 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({
      path: expect.stringMatching(/^products\/staging\/[0-9a-f-]+\/catalog\.webp$/),
      token: "signed_upload_token",
      uploadUrl: expect.stringMatching(/^https:\/\/example\.supabase\.co\/storage\/v1\/object\/upload\/sign\//),
      expiresAt: expect.any(String),
    }));
    expect(JSON.stringify(response.body)).not.toContain("sb_secret_");
    expect(JSON.stringify(fetchMock.mock.calls)).toContain("sb_secret_must_never_leave_server");
  });

  it("rejects a staged object whose bytes disagree with its MIME type", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("plain text", {
      status: 200,
      headers: { "Content-Type": "image/png" },
    })));

    await expect(validateStagedImage({ ...stagedImage, byteSize: 10 }))
      .rejects.toMatchObject({ code: "INVALID_PRODUCT_IMAGE" });
  });

  it("checks actual dimensions instead of trusting browser metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(ONE_PIXEL_PNG, {
      status: 200,
      headers: { "Content-Type": "image/png" },
    })));

    await expect(validateStagedImage({ ...stagedImage, width: 640, height: 480 }))
      .rejects.toMatchObject({ code: "INVALID_PRODUCT_IMAGE" });
  });

  it("accepts a staged image only when bytes, signature, MIME, and dimensions agree", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(ONE_PIXEL_PNG, {
      status: 200,
      headers: { "Content-Type": "image/png" },
    })));

    const validated = await validateStagedImage(stagedImage);

    expect(validated).toMatchObject({ ...stagedImage, bytes: ONE_PIXEL_PNG });
  });

  it("finalizes both variants and persists their responsive metadata", async () => {
    const agent = await loggedInAgent();
    vi.stubEnv("QLEAVES_DATABASE_PROVIDER", "postgresql");
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (!init?.method) {
        return Promise.resolve(new Response(ONE_PIXEL_PNG, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await agent.post("/api/v1/admin/products").send({
      ...newProduct,
      stagedImages,
    });

    expect(response.status).toBe(201);
    const stored = await prisma.product.findUnique({
      where: { slug: newProduct.slug },
      include: { media: { orderBy: { sortOrder: "asc" } } },
    });
    expect(stored?.media).toMatchObject([
      { purpose: "catalog", width: 1, height: 1, altText: newProduct.imageAltText },
      { purpose: "detail", width: 1, height: 1, altText: newProduct.imageAltText },
    ]);
    const publicResponse = await request(createApp()).get(`/api/v1/products/${newProduct.slug}`);
    expect(publicResponse.body.media).toMatchObject([
      { purpose: "catalog", width: 1, height: 1 },
      { purpose: "detail", width: 1, height: 1 },
    ]);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(2);
  });

  it("rejects the Base64 compatibility input in PostgreSQL mode", async () => {
    const agent = await loggedInAgent();
    vi.stubEnv("QLEAVES_DATABASE_PROVIDER", "postgresql");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await agent.post("/api/v1/admin/products").send({
      ...newProduct,
      imageDataUrl: `data:image/png;base64,${ONE_PIXEL_PNG.toString("base64")}`,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes copied final objects when database creation fails", async () => {
    const agent = await loggedInAgent();
    vi.stubEnv("QLEAVES_DATABASE_PROVIDER", "postgresql");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (!init?.method) {
        return Promise.resolve(new Response(ONE_PIXEL_PNG, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await agent.post("/api/v1/admin/products").send({
      ...newProduct,
      slug: "house-plant",
      sku: "QL-DUPLICATE-SLUG",
      stagedImages,
    });

    expect(response.status).toBe(500);
    const deletedUrls = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "DELETE")
      .map(([url]) => String(url));
    expect(deletedUrls).toHaveLength(2);
    expect(deletedUrls.every((url) => url.includes("/products/house-plant/"))).toBe(true);
    expect(deletedUrls.some((url) => url.includes("/products/staging/"))).toBe(false);
  });
});
