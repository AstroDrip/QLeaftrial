import { Router } from "express";
import { adminProductRouter } from "./modules/admin/admin-product.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { productRouter } from "./modules/products/product.routes.js";
import { orderRouter } from "./modules/orders/order.routes.js";
import { geoRouter } from "./modules/geo/geo.routes.js";
import { storeSettingsRouter } from "./modules/admin/store-settings.routes.js";
import { securityRouter } from "./modules/security/security.routes.js";
import { sitemapRouter } from "./modules/seo/sitemap.routes.js";
import { sheetsRouter } from "./modules/sheets/sheets.routes.js";
import { invoiceRouter } from "./modules/orders/invoice.routes.js";
import { reviewRouter } from "./modules/reviews/review.routes.js";

export const apiRouter = Router();
export const siteRouter = Router();

siteRouter.use(sitemapRouter);

apiRouter.use(authRouter);
apiRouter.use(adminProductRouter);
apiRouter.use(productRouter);
apiRouter.use(orderRouter);
apiRouter.use(geoRouter);
apiRouter.use(storeSettingsRouter);
apiRouter.use(securityRouter);
apiRouter.use(sheetsRouter);
apiRouter.use(invoiceRouter);
apiRouter.use(reviewRouter);
