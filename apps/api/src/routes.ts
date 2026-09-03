import { Router } from "express";
import { productRouter } from "./modules/products/product.routes.js";

export const apiRouter = Router();

apiRouter.use(productRouter);
