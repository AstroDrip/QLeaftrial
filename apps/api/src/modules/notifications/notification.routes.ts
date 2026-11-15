import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { ApiError } from "../../middleware/error-handler.js";
import { requireAdmin } from "../auth/auth.middleware.js";
import { emailSettings } from "./email-provider.js";
import { listNotifications, processDueNotifications, retryNotification } from "./outbox.js";

export const notificationRouter = Router();

function workerAuthorised(header: string | undefined): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16 || !header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// The scheduled worker: retries notifications that are due. Called by Vercel's scheduler (a GET carrying
// "Authorization: Bearer <CRON_SECRET>") or by any other scheduler with the same secret. Without the secret set,
// the endpoint is closed.
const worker = async (req: { get(name: string): string | undefined }, res: { setHeader(name: string, value: string): void; json(body: unknown): void }) => {
  if (!workerAuthorised(req.get("Authorization"))) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  const notifications = await processDueNotifications({ limit: 20, budgetMs: 20_000 });
  res.setHeader("Cache-Control", "no-store");
  res.json({ notifications });
};
notificationRouter.get("/internal/worker", worker);
notificationRouter.post("/internal/worker", worker);

notificationRouter.get("/admin/notifications", requireAdmin, async (req, res) => {
  const status = typeof req.query.status === "string" && /^(PENDING|SENDING|SENT|FAILED|DISABLED)$/.test(req.query.status) ? req.query.status : undefined;
  if (req.query.status !== undefined && !status) throw new ApiError(400, "VALIDATION_ERROR", "Invalid notification status");
  res.setHeader("Cache-Control", "no-store");
  res.json({ configured: emailSettings() !== null, items: await listNotifications({ status }) });
});

notificationRouter.post("/admin/notifications/:id/retry", requireAdmin, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await retryNotification(String(req.params.id)));
});
