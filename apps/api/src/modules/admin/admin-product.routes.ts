import { Router } from "express";
import { requireAdmin } from "../auth/auth.middleware.js";
import { ApiError } from "../../middleware/error-handler.js";
import { createAdminProductSchema, describeProductPhotoSchema, productPhotoSchema, productUploadMetadataSchema, reorderProductPhotosSchema, replaceProductImagesSchema, updateAdminProductSchema } from "./admin-product.schemas.js";
import { adminProductPageSchema, createAdminProduct, deleteAdminProduct, getAdminProduct, listAdminProducts, listAdminProductsPage, replaceAdminProductImages, updateAdminProduct } from "./admin-product.service.js";
import { addProductPhoto, describeProductPhoto, removeProductPhoto, reorderProductPhotos, replaceProductPhoto } from "./admin-product-photos.service.js";
import { authorizeProductUpload } from "./product-upload.service.js";
import { consumeRateLimit } from "../../lib/rate-limit.js";
import { invalidateProductSearchIndex } from "../products/product-search-index.js";

export const adminProductRouter = Router();

adminProductRouter.use("/admin/products", requireAdmin);
adminProductRouter.use("/admin/product-uploads", requireAdmin);
// Any change to a product refreshes the search index on this server (other servers refresh within a minute).
adminProductRouter.use("/admin/products", (request, _response, next) => {
  if (request.method !== "GET") invalidateProductSearchIndex();
  next();
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

adminProductRouter.get("/admin/products", async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  // With ?page=… one page (25, 50 or 100) with search, view and sort; without it every product (pickers).
  if (request.query.page === undefined) return void response.json({ items: await listAdminProducts() });
  const parsed = adminProductPageSchema.safeParse(request.query);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid list request");
  response.json(await listAdminProductsPage(parsed.data));
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

// One photograph at a time (up to three per product). Each answers with the product as it now is.
const productId = (request: { params: Record<string, string | string[]> }) => String(request.params.id);
const photoKey = (request: { params: Record<string, string | string[]> }) => String(request.params.key);

adminProductRouter.post("/admin/products/:id/photos", async (request, response) => {
  const parsed = productPhotoSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid product photo");
  await addProductPhoto(productId(request), parsed.data);
  response.setHeader("Cache-Control", "no-store");
  response.status(201).json(await getAdminProduct(productId(request)));
});

adminProductRouter.put("/admin/products/:id/photos/order", async (request, response) => {
  const parsed = reorderProductPhotosSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid photo order");
  await reorderProductPhotos(productId(request), parsed.data.keys);
  response.setHeader("Cache-Control", "no-store");
  response.json(await getAdminProduct(productId(request)));
});

adminProductRouter.put("/admin/products/:id/photos/:key", async (request, response) => {
  const parsed = productPhotoSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid product photo");
  await replaceProductPhoto(productId(request), photoKey(request), parsed.data);
  response.setHeader("Cache-Control", "no-store");
  response.json(await getAdminProduct(productId(request)));
});

adminProductRouter.patch("/admin/products/:id/photos/:key", async (request, response) => {
  const parsed = describeProductPhotoSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Describe the photo in 2 to 200 characters");
  await describeProductPhoto(productId(request), photoKey(request), parsed.data.altText);
  response.setHeader("Cache-Control", "no-store");
  response.json(await getAdminProduct(productId(request)));
});

adminProductRouter.delete("/admin/products/:id/photos/:key", async (request, response) => {
  await removeProductPhoto(productId(request), photoKey(request));
  response.setHeader("Cache-Control", "no-store");
  response.json(await getAdminProduct(productId(request)));
});

adminProductRouter.delete("/admin/products/:id", async (request, response) => {
  await deleteAdminProduct(request.params.id);
  response.status(204).end();
});
