import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApi } from "./admin-api";
import { createProductImageVariants } from "./product-image-variants";

vi.mock("./product-image-variants", () => ({ createProductImageVariants: vi.fn() }));

const fields = {
  name: "New Fern",
  nameAr: "سرخس جديد",
  slug: "new-fern",
  sku: "QL-NF-007",
  description: "A fresh fern for a shaded corner.",
  descriptionAr: "سرخس جديد لزاوية مظللة في المنزل.",
  category: "Indoor",
  categoryAr: "داخلي",
  light: "Low indirect",
  lightAr: "إضاءة منخفضة غير مباشرة",
  priceQar: 90,
  costPrice: 35,
  stock: 4,
  imageAltText: "New fern in a pot",
};

describe("admin product image upload orchestration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("authorizes, uploads, and finalizes both optimized variants", async () => {
    vi.mocked(createProductImageVariants).mockResolvedValue([
      { purpose: "catalog", blob: new Blob(["small"], { type: "image/webp" }), contentType: "image/webp", byteSize: 5, width: 640, height: 480 },
      { purpose: "detail", blob: new Blob(["large"], { type: "image/webp" }), contentType: "image/webp", byteSize: 5, width: 1400, height: 1050 },
    ]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ path: "products/staging/id/catalog.webp", token: "catalog-token", uploadUrl: "https://example.supabase.co/catalog?token=one", expiresAt: "2026-09-05T12:00:00Z" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ path: "products/staging/id/detail.webp", token: "detail-token", uploadUrl: "https://example.supabase.co/detail?token=two", expiresAt: "2026-09-05T12:00:00Z" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "plant-1", slug: "new-fern", name: "New Fern", priceQar: 90, stock: 4 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await adminApi.createProductWithImage(
      fields,
      new File(["source"], "fern.png", { type: "image/png" }),
      true,
    );

    expect(result).toMatchObject({ id: "plant-1", slug: "new-fern" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const finalRequest = fetchMock.mock.calls[4]?.[1] as RequestInit;
    const finalBody = JSON.parse(String(finalRequest.body));
    expect(finalBody.stagedImages).toEqual([
      { stagingPath: "products/staging/id/catalog.webp", purpose: "catalog", contentType: "image/webp", byteSize: 5, width: 640, height: 480 },
      { stagingPath: "products/staging/id/detail.webp", purpose: "detail", contentType: "image/webp", byteSize: 5, width: 1400, height: 1050 },
    ]);
    expect(JSON.stringify(finalBody)).not.toContain("token");
    expect(JSON.stringify(finalBody)).not.toContain("Blob");
  });
});

describe("admin order bulk deletion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("deletes the selected orders in one atomic API request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await adminApi.deleteOrders(["order-1", "order-2"]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/admin/orders", expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({ ids: ["order-1", "order-2"] }),
    }));
  });
});
