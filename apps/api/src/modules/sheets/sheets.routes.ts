import { Router } from "express";
import { ApiError } from "../../middleware/error-handler.js";
import { requireAdmin } from "../auth/auth.middleware.js";
import { listOrders } from "../orders/order.service.js";
import { SheetsError } from "./google-auth.js";
import { sheetUrl, sheetsConfig, syncAllOrders } from "./order-sheet.js";

export const sheetsRouter = Router();

sheetsRouter.use("/admin/sheets", requireAdmin);

sheetsRouter.get("/admin/sheets/status", (_request, response) => {
  const config = sheetsConfig();
  response.setHeader("Cache-Control", "no-store");
  response.json(config ? { configured: true, tab: config.tab, sheetUrl: sheetUrl(config) } : { configured: false });
});

sheetsRouter.post("/admin/sheets/sync", async (_request, response) => {
  const config = sheetsConfig();
  if (!config) throw new ApiError(409, "SHEETS_NOT_CONFIGURED", "Google Sheets is not set up yet");
  try {
    const synced = await syncAllOrders(await listOrders(), config);
    response.setHeader("Cache-Control", "no-store");
    response.json({ synced });
  } catch (error) {
    // Only the failure category reaches the browser; details stay out of responses and logs.
    const detail = error instanceof SheetsError ? error.message : "unknown";
    console.error(JSON.stringify({ level: "error", event: "sheet-sync-all-failed", reason: detail }));
    const code = error instanceof SheetsError && error.code === "GOOGLE_AUTH_FAILED" ? "SHEETS_AUTH_FAILED" : "SHEETS_SYNC_FAILED";
    throw new ApiError(502, code, "Could not update the Google Sheet");
  }
});
