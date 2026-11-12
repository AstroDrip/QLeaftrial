import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth/auth.middleware.js";
import { ApiError } from "../../middleware/error-handler.js";
import { getStoreSettings, updateStoreSettings } from "./store-settings.service.js";
import { applyEdgeOnlyCacheHeaders } from "../../middleware/cache-headers.js";

export const storeSettingsRouter = Router();

// Every page reads these (business details, whether ordering is on). The CDN keeps a copy for a minute and
// keeps serving the last good one while it refreshes, so a cold function or a database blip never empties
// the About page. Checkout re-checks "ordering enabled" on the server, so a stale copy is harmless.
storeSettingsRouter.get("/storefront/settings", async (_request, response) => {
  applyEdgeOnlyCacheHeaders(response);
  response.json(await getStoreSettings());
});

storeSettingsRouter.get("/admin/storefront-settings", requireAdmin, async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json(await getStoreSettings());
});

storeSettingsRouter.put("/admin/storefront-settings", requireAdmin, async (request, response) => {
  const parsed = z.object({
    orderingEnabled: z.boolean().optional(),
    commercialRegistration: z.string().trim().max(100).nullable().optional(),
    ecommerceLicense: z.string().trim().max(100).nullable().optional(),
    businessAddress: z.string().trim().max(300).nullable().optional(),
    supportEmail: z.string().trim().email().max(200).nullable().optional(),
    supportPhone: z.string().trim().max(40).nullable().optional(),
  }).strict().refine((value) => Object.keys(value).length > 0).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid storefront settings");
  response.setHeader("Cache-Control", "no-store");
  response.json(await updateStoreSettings(parsed.data));
});
