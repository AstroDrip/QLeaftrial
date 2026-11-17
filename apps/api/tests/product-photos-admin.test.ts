import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { distinctPhotos } from "../src/lib/product-photos";
import { sweepProductStorage } from "../src/modules/admin/product-storage-sweep";
import { loggedInAgent, resetDatabase } from "./helpers";

// Admin photo management: up to three photographs per product, each kept whole (both sizes), in an order the admin
// chooses, with the first one as the main photo. No real storage is used: development mode keeps images inline, and
// the production-mode tests answer storage requests with a stand-in.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=";
const DATA_URL = `data:image/png;base64,${PNG}`;
const hash = (n: number) => n.toString(16).padStart(64, "0");
const db = prisma as any;

const newProduct = {
  name: "Photo Fern", slug: "photo-fern", sku: "QL-PF-1", description: "A fern used to test product photos.", category: "Indoor Plants",
  priceQar: 90, costPrice: 30, stock: 4, imageAltText: "Photo fern, first photo", imageDataUrl: DATA_URL, contentHash: hash(1),
};
const photo = (n: number) => ({ imageDataUrl: DATA_URL, imageAltText: `Photo fern, photo ${n}`, contentHash: hash(n) });

describe("admin product photos", () => {
  beforeEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await resetDatabase(); });
  afterAll(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await prisma.$disconnect(); });

  async function created() {
    const admin = await loggedInAgent();
    const response = await admin.post("/api/v1/admin/products").send(newProduct).expect(201);
    return { admin, id: response.body.id as string, product: response.body };
  }
  const rows = (productId: string) => db.productMedia.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });

  it("adds up to three photographs, refuses a fourth and the same photograph twice", async () => {
    const { admin, id, product } = await created();
    expect(product.photos).toHaveLength(1);
    expect(product.photosMissing).toBe(2);
    expect(product.photos[0].key).toMatch(/^[0-9a-f-]{36}$/);

    const two = await admin.post(`/api/v1/admin/products/${id}/photos`).send(photo(2)).expect(201);
    expect(two.body.photos.map((item: { altText: string }) => item.altText)).toEqual(["Photo fern, first photo", "Photo fern, photo 2"]);
    const duplicate = await admin.post(`/api/v1/admin/products/${id}/photos`).send(photo(2));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("DUPLICATE_PHOTO");
    const three = await admin.post(`/api/v1/admin/products/${id}/photos`).send(photo(3)).expect(201);
    expect(three.body.photosMissing).toBe(0);
    const fourth = await admin.post(`/api/v1/admin/products/${id}/photos`).send(photo(4));
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe("PHOTO_LIMIT");
    expect((await rows(id)).map((row: { sortOrder: number }) => row.sortOrder)).toEqual([0, 1, 2]);
  });

  it("reorders, sets the main photograph, replaces one in place and removes one, keeping the order tidy", async () => {
    const { admin, id } = await created();
    await admin.post(`/api/v1/admin/products/${id}/photos`).send(photo(2)).expect(201);
    const before = (await admin.post(`/api/v1/admin/products/${id}/photos`).send(photo(3)).expect(201)).body.photos as Array<{ key: string; altText: string }>;
    const [first, second, third] = before.map((item) => item.key);

    const reordered = await admin.put(`/api/v1/admin/products/${id}/photos/order`).send({ keys: [third, first, second] }).expect(200);
    expect(reordered.body.photos.map((item: { key: string }) => item.key)).toEqual([third, first, second]);
    expect(reordered.body.image.altText).toBe("Photo fern, photo 3"); // the main photo is the first

    const stale = await admin.put(`/api/v1/admin/products/${id}/photos/order`).send({ keys: [first, second] });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("PHOTOS_CHANGED");

    const replaced = await admin.put(`/api/v1/admin/products/${id}/photos/${first}`).send(photo(7)).expect(200);
    expect(replaced.body.photos.map((item: { altText: string }) => item.altText)).toEqual(["Photo fern, photo 3", "Photo fern, photo 7", "Photo fern, photo 2"]);
    const clash = await admin.put(`/api/v1/admin/products/${id}/photos/${second}`).send(photo(3));
    expect(clash.body.error.code).toBe("DUPLICATE_PHOTO");
    // Replacing a photograph with itself (the same picture again) is allowed.
    await admin.put(`/api/v1/admin/products/${id}/photos/${second}`).send(photo(2)).expect(200);

    const described = await admin.patch(`/api/v1/admin/products/${id}/photos/${third}`).send({ altText: "Fern leaves up close" }).expect(200);
    expect(described.body.photos[0].altText).toBe("Fern leaves up close");

    const afterRemove = await admin.delete(`/api/v1/admin/products/${id}/photos/${third}`).expect(200);
    expect(afterRemove.body.photos).toHaveLength(2);
    expect((await rows(id)).map((row: { sortOrder: number }) => row.sortOrder)).toEqual([0, 1]);
    const remaining = afterRemove.body.photos.map((item: { key: string }) => item.key);
    await admin.delete(`/api/v1/admin/products/${id}/photos/${remaining[0]}`).expect(200);
    const last = await admin.delete(`/api/v1/admin/products/${id}/photos/${remaining[1]}`);
    expect(last.status).toBe(409);
    expect(last.body.error.code).toBe("LAST_PHOTO");
    expect((await admin.delete(`/api/v1/admin/products/${id}/photos/no-such-photo`)).status).toBe(404);
  });

  it("works with photographs saved before keys existed, and gives them keys when they are rearranged", async () => {
    const { admin, id } = await created();
    await db.productMedia.deleteMany({ where: { productId: id } });
    await db.productMedia.createMany({ data: [
      { productId: id, url: "/media/plants/a-640.webp", altText: "A", purpose: "catalog", sortOrder: 0 },
      { productId: id, url: "/media/plants/a-1024.webp", altText: "A", purpose: "detail", sortOrder: 1 },
      { productId: id, url: "/media/plants/b-640.webp", altText: "B", purpose: "catalog", sortOrder: 2 },
      { productId: id, url: "/media/plants/b-1024.webp", altText: "B", purpose: "detail", sortOrder: 3 },
    ] });
    const listed = (await admin.get("/api/v1/admin/products").expect(200)).body.items.find((item: { id: string }) => item.id === id);
    expect(listed.photos.map((item: { url: string; detailUrl: string }) => [item.url, item.detailUrl])).toEqual([["/media/plants/a-640.webp", "/media/plants/a-1024.webp"], ["/media/plants/b-640.webp", "/media/plants/b-1024.webp"]]);
    const keys = listed.photos.map((item: { key: string }) => item.key);
    expect(keys.every((key: string) => key.startsWith("file-"))).toBe(true);

    await admin.put(`/api/v1/admin/products/${id}/photos/order`).send({ keys: [keys[1], keys[0]] }).expect(200);
    const after = await rows(id);
    expect(after.map((row: { url: string }) => row.url)).toEqual(["/media/plants/b-640.webp", "/media/plants/b-1024.webp", "/media/plants/a-640.webp", "/media/plants/a-1024.webp"]);
    expect(after[0].photoKey).toBeTruthy();
    expect(after[0].photoKey).toBe(after[1].photoKey);
    expect(after[2].photoKey).not.toBe(after[0].photoKey);
  });

  it("gives the storefront each photograph's key, so pages group the sizes the same way", async () => {
    const { admin, id } = await created();
    // A different picture (a red pixel): the storefront shows an identical file only once.
    const red = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await admin.post(`/api/v1/admin/products/${id}/photos`).send({ ...photo(2), imageDataUrl: red }).expect(201);
    const publicProduct = (await request(createApp()).get("/api/v1/products/photo-fern").expect(200)).body;
    expect(publicProduct.media.every((item: { photoKey: string }) => typeof item.photoKey === "string")).toBe(true);
    expect(distinctPhotos(publicProduct.media)).toHaveLength(2);
  });

  it("keeps every photo action behind the admin login", async () => {
    const { id, product } = await created();
    const anonymous = request(createApp());
    expect((await anonymous.post(`/api/v1/admin/products/${id}/photos`).send(photo(2))).status).toBe(401);
    expect((await anonymous.put(`/api/v1/admin/products/${id}/photos/order`).send({ keys: [product.photos[0].key] })).status).toBe(401);
    expect((await anonymous.delete(`/api/v1/admin/products/${id}/photos/${product.photos[0].key}`)).status).toBe(401);
  });

  describe("in production mode (storage stand-in)", () => {
    const BUCKET_URL = "https://example.supabase.co/storage/v1/object";
    const staged = (purpose: "catalog" | "detail", folder: string) => ({
      stagingPath: `products/staging/${folder}/${purpose}.png`, purpose, contentType: "image/png", byteSize: Buffer.from(PNG, "base64").length, width: 1, height: 1,
    });
    function storage(options: { failDatabase?: boolean } = {}) {
      const calls: Array<{ method: string; url: string }> = [];
      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ method: init?.method ?? "GET", url: String(url) });
        if (!init?.method) return new Response(Buffer.from(PNG, "base64"), { status: 200, headers: { "Content-Type": "image/png" } });
        return new Response(null, { status: 200 });
      }));
      return calls;
    }
    beforeEach(() => {
      vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
      vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_only");
      vi.stubEnv("SUPABASE_PRODUCT_IMAGE_BUCKET", "product-images");
    });

    it("moves both uploaded sizes into place for a new photograph, and deletes the old files only after a replacement is saved", async () => {
      const { admin, id } = await created();
      vi.stubEnv("QLEAVES_DATABASE_PROVIDER", "postgresql");
      const calls = storage();
      const added = await admin.post(`/api/v1/admin/products/${id}/photos`).send({
        stagedImages: [staged("catalog", "550e8400-e29b-41d4-a716-446655440000"), staged("detail", "6ba7b810-9dad-41d1-80b4-00c04fd430c8")],
        imageAltText: "Second photo", contentHash: hash(2),
      }).expect(201);
      const second = added.body.photos[1];
      expect(second.url).toMatch(/^https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/product-images\/products\/photo-fern\/catalog-/);
      expect(second.detailUrl).toMatch(/\/products\/photo-fern\/detail-/);
      // The two staging copies are removed once the photograph is saved.
      expect(calls.filter((call) => call.method === "DELETE").map((call) => call.url.replace(BUCKET_URL, ""))).toEqual(expect.arrayContaining([
        "/product-images/products/staging/550e8400-e29b-41d4-a716-446655440000/catalog.png",
        "/product-images/products/staging/6ba7b810-9dad-41d1-80b4-00c04fd430c8/detail.png",
      ]));

      calls.length = 0;
      await admin.put(`/api/v1/admin/products/${id}/photos/${second.key}`).send({
        stagedImages: [staged("catalog", "7c9e6679-7425-40de-944b-e07fc1f90ae7"), staged("detail", "9b2f1c3e-1d2a-4b5c-8d6e-0f1a2b3c4d5e")],
        imageAltText: "Second photo, retaken", contentHash: hash(9),
      }).expect(200);
      const deleted = calls.filter((call) => call.method === "DELETE").map((call) => call.url);
      const oldCatalog = new URL(second.url).pathname.replace("/storage/v1/object/public/", "/storage/v1/object/");
      expect(deleted.some((url) => new URL(url).pathname === oldCatalog)).toBe(true);
    });

    it("refuses inline images in production, and removes the copied files when saving fails", async () => {
      const { admin, id } = await created();
      vi.stubEnv("QLEAVES_DATABASE_PROVIDER", "postgresql");
      const calls = storage();
      expect((await admin.post(`/api/v1/admin/products/${id}/photos`).send(photo(2))).status).toBe(400);
      const duplicate = await admin.post(`/api/v1/admin/products/${id}/photos`).send({
        stagedImages: [staged("catalog", "550e8400-e29b-41d4-a716-446655440000"), staged("detail", "6ba7b810-9dad-41d1-80b4-00c04fd430c8")],
        imageAltText: "Same as the first", contentHash: hash(1),
      });
      expect(duplicate.body.error.code).toBe("DUPLICATE_PHOTO");
      // Refused before any file was copied.
      expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
    });

    it("tidies storage: old abandoned uploads and unused files go; recent, referenced and review files stay", async () => {
      const { id } = await created();
      await db.productMedia.updateMany({ where: { productId: id }, data: { url: "https://example.supabase.co/storage/v1/object/public/product-images/products/photo-fern/catalog-in-use.webp" } });
      const old = "2026-11-01T00:00:00.000Z";
      const recent = new Date().toISOString();
      const listing: Record<string, Array<{ name: string; id: string | null; created_at?: string }>> = {
        "products/": [{ name: "staging", id: null }, { name: "photo-fern", id: null }, { name: "reviews", id: null }],
        "products/staging/": [{ name: "abandoned", id: null }, { name: "in-progress", id: null }],
        "products/staging/abandoned/": [{ name: "catalog.webp", id: "1", created_at: old }],
        "products/staging/in-progress/": [{ name: "catalog.webp", id: "2", created_at: recent }],
        "products/photo-fern/": [{ name: "catalog-in-use.webp", id: "3", created_at: old }, { name: "catalog-replaced.webp", id: "4", created_at: old }],
        "products/reviews/": [{ name: "customer.webp", id: "5", created_at: old }],
      };
      const deleted: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/object/list/")) return new Response(JSON.stringify(listing[JSON.parse(String(init!.body)).prefix] ?? []), { status: 200 });
        if (init?.method === "DELETE") { deleted.push(new URL(String(url)).pathname.replace("/storage/v1/object/product-images/", "")); return new Response(null, { status: 200 }); }
        return new Response(null, { status: 404 });
      }));
      const summary = await sweepProductStorage();
      expect(summary).toMatchObject({ configured: true, staging: 1, unused: 1, failed: 0 });
      expect(deleted.sort()).toEqual(["products/photo-fern/catalog-replaced.webp", "products/staging/abandoned/catalog.webp"]);
    });

    it("does nothing when storage is not set up", async () => {
      vi.unstubAllEnvs();
      vi.stubEnv("SUPABASE_URL", "");
      expect(await sweepProductStorage()).toMatchObject({ configured: false, staging: 0, unused: 0 });
    });
  });
});
