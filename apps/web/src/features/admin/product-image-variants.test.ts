import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductImageVariants } from "./product-image-variants";

describe("browser product image variants", () => {
  const drawImage = vi.fn();

  beforeEach(() => {
    drawImage.mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback, type) => {
      callback(new Blob(["optimized"], { type: type ?? "image/webp" }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not enlarge a small source", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 320, height: 240, close }));

    const variants = await createProductImageVariants(new File(["image"], "plant.png", { type: "image/png" }));

    expect(variants.map((item) => [item.width, item.height])).toEqual([[320, 240], [320, 240]]);
    expect(variants.map((item) => item.purpose)).toEqual(["catalog", "detail"]);
    expect(variants.every((item) => item.contentType === "image/webp")).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it("creates aspect-preserving 640px and 1400px WebP variants", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 2800, height: 2100, close: vi.fn() }));

    const variants = await createProductImageVariants(new File(["image"], "plant.jpg", { type: "image/jpeg" }));

    expect(variants.map((item) => [item.width, item.height])).toEqual([[640, 480], [1400, 1050]]);
    expect(drawImage).toHaveBeenNthCalledWith(1, expect.anything(), 0, 0, 640, 480);
  });

  it("rejects GIF input instead of flattening animation", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);

    await expect(createProductImageVariants(new File(["gif"], "plant.gif", { type: "image/gif" })))
      .rejects.toThrow(/JPEG, PNG, or WebP/i);
    expect(decode).not.toHaveBeenCalled();
  });
});
