import { Router } from "express";
import { ApiError } from "../../middleware/error-handler.js";
import { productQuerySchema } from "./product.schemas.js";
import { findProductBySlug, listProductFilters, listProducts } from "./product.service.js";

export const productRouter = Router();

productRouter.get("/products", async (request, response) => {
  const parsedQuery = productQuerySchema.safeParse(request.query);

  if (!parsedQuery.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid product catalogue query");
  }

  response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  response.json(await listProducts(parsedQuery.data));
});

productRouter.get("/products/filters", async (_request, response) => {
  response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  response.json(await listProductFilters());
});

productRouter.get("/products/:slug", async (request, response) => {
  const product = await findProductBySlug(request.params.slug);

  if (!product) {
    throw new ApiError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }

  response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  response.json(product);
});
