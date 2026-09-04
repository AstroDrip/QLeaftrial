import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseProductImageDataUrl,
  removeStoredProductImage,
  storeProductImage,
} from "../src/modules/admin/product-image-storage";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII=";

describe("product image storage", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("validates the decoded file signature instead of trusting the data URL MIME", () => {
    expect(() => parseProductImageDataUrl("data:image/png;base64,aGVsbG8=")).toThrow(
      "Image contents do not match the declared image type",
    );
  });

  it("accepts a real PNG and reports its binary metadata", () => {
    const parsed = parseProductImageDataUrl(ONE_PIXEL_PNG);

    expect(parsed.mimeType).toBe("image/png");
    expect(parsed.extension).toBe("png");
    expect(parsed.bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("keeps the validated data URL for SQLite development without calling storage", async () => {
    vi.stubEnv("QLEAVES_DATABASE_PROVIDER", "sqlite");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const stored = await storeProductImage(ONE_PIXEL_PNG, "new-fern");

    expect(stored).toEqual({ url: ONE_PIXEL_PNG });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads PostgreSQL images to Supabase Storage and returns only a public URL", async () => {
    vi.stubEnv("QLEAVES_DATABASE_PROVIDER", "postgresql");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co/");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv("SUPABASE_PRODUCT_IMAGE_BUCKET", "product-images");

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const stored = await storeProductImage(ONE_PIXEL_PNG, "new-fern");

    expect(stored.url).toMatch(
      /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/product-images\/products\/new-fern\/[0-9a-f-]+\.png$/,
    );
    expect(stored.storagePath).toMatch(/^products\/new-fern\/[0-9a-f-]+\.png$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(
      /^https:\/\/example\.supabase\.co\/storage\/v1\/object\/product-images\/products\/new-fern\/[0-9a-f-]+\.png$/,
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      apikey: "sb_secret_test",
      "Content-Type": "image/png",
      "x-upsert": "false",
    });
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("uses bearer authorization only for the legacy service-role JWT", async () => {
    vi.stubEnv("QLEAVES_DATABASE_PROVIDER", "postgresql");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-jwt");
    vi.stubEnv("SUPABASE_PRODUCT_IMAGE_BUCKET", "product-images");

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await storeProductImage(ONE_PIXEL_PNG, "new-fern");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      apikey: "legacy-jwt",
      Authorization: "Bearer legacy-jwt",
    });
  });

  it("deletes an uploaded object when cleanup is requested", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv("SUPABASE_PRODUCT_IMAGE_BUCKET", "product-images");

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await removeStoredProductImage({
      url: "https://example.supabase.co/storage/v1/object/public/product-images/products/new-fern/id.png",
      storagePath: "products/new-fern/id.png",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/storage/v1/object/product-images/products/new-fern/id.png",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
