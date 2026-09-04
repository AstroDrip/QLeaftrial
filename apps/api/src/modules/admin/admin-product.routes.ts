import { Router } from "express";
import { requireAdmin } from "../auth/auth.middleware.js";
import { ApiError } from "../../middleware/error-handler.js";
import { updateAdminProductSchema } from "./admin-product.schemas.js";
import { listAdminProducts, updateAdminProduct } from "./admin-product.service.js";

export const adminProductRouter = Router();

adminProductRouter.use("/admin/products", requireAdmin);

adminProductRouter.get("/admin/products", async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ items: await listAdminProducts() });
});

adminProductRouter.patch("/admin/products/:id", async (request, response) => {
  const parsed = updateAdminProductSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Price and stock must be non-negative integers");
  }

  response.setHeader("Cache-Control", "no-store");
  response.json(await updateAdminProduct(request.params.id, parsed.data));
});
