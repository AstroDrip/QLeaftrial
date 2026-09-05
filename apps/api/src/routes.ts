import { Router } from "express";
import { adminProductRouter } from "./modules/admin/admin-product.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { productRouter } from "./modules/products/product.routes.js";
import { orderRouter } from "./modules/orders/order.routes.js";
import { securityRouter } from "./modules/security/security.routes.js";

export const apiRouter = Router();

apiRouter.use(authRouter);
apiRouter.use(adminProductRouter);
apiRouter.use(productRouter);
apiRouter.use(orderRouter);
apiRouter.use(securityRouter);
