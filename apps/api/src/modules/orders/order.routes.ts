import { Router } from "express";
import { requireAdmin } from "../auth/auth.middleware.js";
import { ApiError } from "../../middleware/error-handler.js";
import {
  acceptEditedOrderSchema,
  bulkDeleteOrdersSchema,
  createOrderSchema,
  deleteOrdersSchema,
  updateOrderStatusSchema,
  updatePaymentStatusSchema, confirmDeliveryFeeSchema,
} from "./order.schemas.js";
import {
  acceptEditedOrder,
  createOrder,
  dashboardStats,
  deleteOrder,
  deleteOrders,
  listOrders,
  salesReport,
  updateOrderStatus,
  updatePaymentStatus, confirmDeliveryFee, findOrderForKey, requestFingerprint,
} from "./order.service.js";
import { consumeOrderAttempt, consumeOrderReplay } from "./order-rate-limit.js";
import { mirrorOrderToSheet } from "../sheets/order-sheet.js";
import { toAdminOrder, toPublicOrder } from "./order-view.js";
import type { Response } from "express";
import { actorFrom, listAudit } from "../admin/audit.js";
import { deliverForOrder, processDueNotifications } from "../notifications/outbox.js";

export const orderRouter = Router();

function qatarDateBoundary(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid sales report dates");
  }
  const parsed = new Date(`${value}T00:00:00+03:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid sales report dates");
  }
  return parsed;
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,80}$/;

function tooManyAttempts(res: Response, retryAfterSeconds: number) {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({ error: { code: "TOO_MANY_ORDER_ATTEMPTS", message: "Too many order attempts. Please try again later." } });
}

// Every order carries an idempotency key (the storefront keeps it with the order on the customer's device). The
// same key with the same request returns the order already saved, however often it is sent; the same key with a
// different request is refused. Recovering an existing order does not count towards the limit on new orders, so a
// customer whose connection dropped is never locked out of their own confirmation.
orderRouter.post("/orders", async (req, res) => {
  const key = req.get("Idempotency-Key");
  if (!key || !IDEMPOTENCY_KEY.test(key)) {
    throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "This order request is missing its reference. Please reload the page and try again");
  }
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order details");
  const fingerprint = requestFingerprint(parsed.data);
  const client = req.ip || req.socket.remoteAddress || "unknown";
  res.setHeader("Cache-Control", "no-store");

  const existing = await findOrderForKey(key, fingerprint);
  if (existing) {
    const replay = await consumeOrderReplay(client);
    if (replay.limited) return tooManyAttempts(res, replay.retryAfterSeconds);
    res.setHeader("Idempotent-Replayed", "true");
    return res.status(200).json(toPublicOrder(existing));
  }

  const attempt = await consumeOrderAttempt(client);
  if (attempt.limited) return tooManyAttempts(res, attempt.retryAfterSeconds);
  const { order, replayed } = await createOrder(parsed.data, key, fingerprint);
  // The order is saved before anything else happens. The admin's email is sent now and waited for (a serverless
  // function may be frozen once it answers), with a short time limit; if it fails it stays recorded for retry.
  // A slow or failing email or sheet sync never fails the order.
  if (!replayed) {
    await deliverForOrder(order.id);
    await mirrorOrderToSheet(order);
  }
  if (replayed) res.setHeader("Idempotent-Replayed", "true");
  res.status(replayed ? 200 : 201).json(toPublicOrder(order));
});

orderRouter.use("/admin/orders", requireAdmin);

orderRouter.get("/admin/orders", async (_req, res) => {
  // An admin is looking: a good moment to retry any email that failed earlier (at most two, briefly).
  await processDueNotifications({ limit: 2, budgetMs: 6_000 });
  res.setHeader("Cache-Control", "no-store");
  res.json({ items: (await listOrders()).map(toAdminOrder) });
});

orderRouter.delete("/admin/orders", async (req, res) => {
  const parsed = deleteOrdersSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order selection");
  await deleteOrders(parsed.data.ids, actorFrom(res.locals));
  res.status(204).end();
});

orderRouter.patch("/admin/orders/:id/status", async (req, res) => {
  const parsed = updateOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order status");
  const order = await updateOrderStatus(req.params.id, parsed.data.status, actorFrom(res.locals));
  await mirrorOrderToSheet(order);
  res.json(toAdminOrder(order));
});

orderRouter.post("/admin/orders/:id/accept-edited", async (req, res) => {
  const parsed = acceptEditedOrderSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid edited order");
  const order = await acceptEditedOrder(req.params.id, parsed.data, actorFrom(res.locals));
  await mirrorOrderToSheet(order);
  res.json(toAdminOrder(order));
});

orderRouter.patch("/admin/orders/:id/delivery-fee", async (req, res) => {
  const parsed = confirmDeliveryFeeSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Enter the delivery charge in whole QAR");
  const order = await confirmDeliveryFee(req.params.id, parsed.data.deliveryFeeQar, actorFrom(res.locals));
  await mirrorOrderToSheet(order);
  res.json(toAdminOrder(order));
});

orderRouter.patch("/admin/orders/:id/payment", async (req, res) => {
  const parsed = updatePaymentStatusSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid payment status");
  const order = await updatePaymentStatus(req.params.id, parsed.data.paymentStatus, actorFrom(res.locals));
  await mirrorOrderToSheet(order);
  res.json(toAdminOrder(order));
});

orderRouter.post("/admin/orders/bulk-delete", async (req, res) => {
  const parsed = bulkDeleteOrdersSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order selection");
  await deleteOrders(parsed.data.ids, actorFrom(res.locals));
  res.json({ deleted: parsed.data.ids.length });
});

orderRouter.delete("/admin/orders/:id", async (req, res) => {
  await deleteOrder(req.params.id, actorFrom(res.locals));
  res.status(204).end();
});

// Who changed an order's status, payment or delivery charge, oldest first. Optionally for one order number.
orderRouter.get("/admin/audit", requireAdmin, async (req, res) => {
  const orderNumber = typeof req.query.orderNumber === "string" && /^[A-Za-z0-9-]{1,40}$/.test(req.query.orderNumber) ? req.query.orderNumber : undefined;
  if (req.query.orderNumber !== undefined && !orderNumber) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order number");
  res.setHeader("Cache-Control", "no-store");
  res.json({ items: await listAudit({ orderNumber }) });
});

orderRouter.get("/admin/dashboard", requireAdmin, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await dashboardStats());
});

orderRouter.get("/admin/sales", requireAdmin, async (req, res) => {
  const from = qatarDateBoundary(req.query.from);
  const to = qatarDateBoundary(req.query.to);
  if (from && to && from >= to) {
    throw new ApiError(400, "VALIDATION_ERROR", "Sales report end date must be after start date");
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(await salesReport(from, to));
});
