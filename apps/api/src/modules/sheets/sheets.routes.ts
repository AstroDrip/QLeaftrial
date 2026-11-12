import { Router } from "express";
import { ApiError } from "../../middleware/error-handler.js";
import { requireAdmin } from "../auth/auth.middleware.js";
import { listOrders } from "../orders/order.service.js";
import { SheetsError } from "./google-auth.js";
import { qualifiesForSheet, recordSheetSync, sheetUrl, sheetsConfig, syncAllOrders, syncOrder } from "./order-sheet.js";
import { prisma } from "../../lib/prisma.js";

export const sheetsRouter = Router();

sheetsRouter.use("/admin/sheets", requireAdmin);

sheetsRouter.get("/admin/sheets/status", (_request, response) => {
  const config = sheetsConfig();
  response.setHeader("Cache-Control", "no-store");
  response.json(config ? { configured: true, tab: config.tab, sheetUrl: sheetUrl(config) } : { configured: false });
});

// Retries one order (from its "Sheet: not updated" note in admin). Same row key as always, so it never duplicates.
sheetsRouter.post("/admin/sheets/sync/:orderId", async (request, response) => {
  const config = sheetsConfig();
  if (!config) throw new ApiError(409, "SHEETS_NOT_CONFIGURED", "Google Sheets is not set up yet");
  const orderId = String(request.params.orderId);
  const order = await (prisma.order as unknown as { findUnique(args: unknown): Promise<Parameters<typeof syncOrder>[0] | null> })
    .findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
  response.setHeader("Cache-Control", "no-store");
  try {
    const written = await syncOrder(order, config);
    if (written) await recordSheetSync([orderId], { ok: true });
    response.json({ written, qualifies: qualifiesForSheet(order) });
  } catch (error) {
    const code = error instanceof SheetsError ? error.code : "SHEETS_SYNC_FAILED";
    console.error(JSON.stringify({ level: "error", event: "sheet-sync-one-failed", reason: error instanceof SheetsError ? error.message : "unknown" }));
    await recordSheetSync([orderId], { ok: false, code });
    throw new ApiError(502, code === "GOOGLE_AUTH_FAILED" ? "SHEETS_AUTH_FAILED" : "SHEETS_SYNC_FAILED", "Could not update the Google Sheet");
  }
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
