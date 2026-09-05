import { Router } from "express";
import { requireAdmin } from "../auth/auth.middleware.js";
import { ApiError } from "../../middleware/error-handler.js";
import { createAdminProductSchema, productUploadMetadataSchema, updateAdminProductSchema } from "./admin-product.schemas.js";
import { createAdminProduct, listAdminProducts, updateAdminProduct } from "./admin-product.service.js";
import { authorizeProductUpload } from "./product-upload.service.js";
import { consumeRateLimit } from "../../lib/rate-limit.js";

export const adminProductRouter = Router();

adminProductRouter.use("/admin/products", requireAdmin);
adminProductRouter.use("/admin/product-uploads", requireAdmin);

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
    throw new ApiError(400, "VALIDATION_ERROR", "Price and stock must be non-negative integers");
  }

  response.setHeader("Cache-Control", "no-store");
  response.json(await updateAdminProduct(request.params.id, parsed.data));
});
