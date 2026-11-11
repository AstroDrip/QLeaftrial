import { Router } from "express";
import { requireAdmin } from "../auth/auth.middleware.js";
import { ApiError } from "../../middleware/error-handler.js";
import { createAdminProductSchema, productUploadMetadataSchema, replaceProductImagesSchema, updateAdminProductSchema } from "./admin-product.schemas.js";
import { createAdminProduct, deleteAdminProduct, listAdminProducts, replaceAdminProductImages, updateAdminProduct } from "./admin-product.service.js";
import { authorizeProductUpload } from "./product-upload.service.js";
import { consumeRateLimit } from "../../lib/rate-limit.js";
import { regeneratePublicCatalogue } from "../../lib/catalogue.js";

export const adminProductRouter = Router();

adminProductRouter.use("/admin/products", requireAdmin);
adminProductRouter.use("/admin/product-uploads", requireAdmin);
adminProductRouter.use("/admin/catalogue", requireAdmin);

adminProductRouter.post("/admin/catalogue/regenerate", async (_request, response) => {
  try {
    const { publishedUrl, version } = await regeneratePublicCatalogue();
    response.json({ ok: true, version, publishedUrl });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      endpoint: "/api/v1/admin/catalogue/regenerate",
      error: error instanceof Error ? error.message : String(error),
    }));
    response.status(500).json({
      error: { code: "CATALOGUE_REGENERATION_FAILED", message: "Could not regenerate the public catalogue" },
    });
  }
});

adminProductRouter.post("/admin/product-uploads", async (request, response) => {
  const parsed = productUploadMetadataSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid image metadata");
  }

  const clientKey = request.ip || request.socket.remoteAddress || "unknown";
  let decision;
  try {
    decision = await consumeRateLimit({
      limiter: "product-upload",
      clientKey,
      limit: 20,
      windowMs: 15 * 60_000,
    });
  } catch {
    throw new ApiError(503, "RATE_LIMIT_UNAVAILABLE", "Image upload is temporarily unavailable");
  }
  if (decision.limited) {
    response.setHeader("Retry-After", String(decision.retryAfterSeconds));
    throw new ApiError(429, "TOO_MANY_UPLOAD_ATTEMPTS", "Too many image upload attempts");
  }

  response.status(201).json(await authorizeProductUpload(parsed.data));
});

adminProductRouter.get("/admin/products", async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ items: await listAdminProducts() });
});

adminProductRouter.post("/admin/products", async (request, response) => {
  const parsed = createAdminProductSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid product");
  }
  response.status(201).json(await createAdminProduct(parsed.data));
});

adminProductRouter.patch("/admin/products/:id", async (request, response) => {
  const parsed = updateAdminProductSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid product changes");
  }

  response.setHeader("Cache-Control", "no-store");
  response.json(await updateAdminProduct(request.params.id, parsed.data));
});

adminProductRouter.put("/admin/products/:id/images", async (request, response) => {
  const parsed = replaceProductImagesSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid product image");
  }
  response.setHeader("Cache-Control", "no-store");
  response.json(await replaceAdminProductImages(request.params.id, parsed.data));
});

adminProductRouter.delete("/admin/products/:id", async (request, response) => {
  await deleteAdminProduct(request.params.id);
  response.status(204).end();
});
