import { Router } from "express";
import { ApiError } from "../../middleware/error-handler.js";
import { cacheProductDetail, cacheProductList } from "../../middleware/cache-headers.js";
import { productQuerySchema } from "./product.schemas.js";
import { findProductBySlug, listProductFilters, listProducts } from "./product.service.js";

export const productRouter = Router();

productRouter.get("/products", cacheProductList, async (request, response) => {
  const parsedQuery = productQuerySchema.safeParse(request.query);

  if (!parsedQuery.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid product catalogue query");
  }

  response.json(await listProducts(parsedQuery.data));
});

productRouter.get("/products/filters", async (_request, response) => {
  response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  response.json(await listProductFilters());
});

productRouter.get("/products/:slug", cacheProductDetail, async (request, response) => {
  const slug = Array.isArray(request.params.slug) ? request.params.slug[0] : request.params.slug;
  const product = await findProductBySlug(slug);

  if (!product) {
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }

  response.json(product);
});
