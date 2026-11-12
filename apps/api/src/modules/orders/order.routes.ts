import { Router } from "express";
import { requireAdmin } from "../auth/auth.middleware.js";
import { ApiError } from "../../middleware/error-handler.js";
import {
  acceptEditedOrderSchema,
  bulkDeleteOrdersSchema,
  createOrderSchema,
  deleteOrdersSchema,
  updateOrderStatusSchema,
  updatePaymentStatusSchema,
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
  updatePaymentStatus,
} from "./order.service.js";
import { publicOrderRateLimit } from "./order-rate-limit.js";
import { mirrorOrderToSheet } from "../sheets/order-sheet.js";
import { toAdminOrder } from "./order-view.js";

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

orderRouter.post("/orders", publicOrderRateLimit, async (req, res) => {
  const header = req.get("Idempotency-Key");
  if (header !== undefined && !IDEMPOTENCY_KEY.test(header)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid idempotency key");
  }
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order details");
  const { order, replayed } = await createOrder(parsed.data, header);
  // The order is saved before anything else happens; a slow or failing sheet sync never fails it.
  if (!replayed) await mirrorOrderToSheet(order);
  res.setHeader("Cache-Control", "no-store");
  if (replayed) res.setHeader("Idempotent-Replayed", "true");
  res.status(replayed ? 200 : 201).json(order);
});

orderRouter.use("/admin/orders", requireAdmin);

orderRouter.get("/admin/orders", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ items: (await listOrders()).map(toAdminOrder) });
});

orderRouter.delete("/admin/orders", async (req, res) => {
  const parsed = deleteOrdersSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order selection");
  await deleteOrders(parsed.data.ids);
  res.status(204).end();
});

orderRouter.patch("/admin/orders/:id/status", async (req, res) => {
  const parsed = updateOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order status");
  const order = await updateOrderStatus(req.params.id, parsed.data.status);
  await mirrorOrderToSheet(order);
  res.json(toAdminOrder(order));
});

orderRouter.post("/admin/orders/:id/accept-edited", async (req, res) => {
  const parsed = acceptEditedOrderSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid edited order");
  const order = await acceptEditedOrder(req.params.id, parsed.data);
  await mirrorOrderToSheet(order);
  res.json(toAdminOrder(order));
});

orderRouter.patch("/admin/orders/:id/payment", async (req, res) => {
  const parsed = updatePaymentStatusSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid payment status");
  const order = await updatePaymentStatus(req.params.id, parsed.data.paymentStatus);
  await mirrorOrderToSheet(order);
  res.json(toAdminOrder(order));
});

orderRouter.post("/admin/orders/bulk-delete", async (req, res) => {
  const parsed = bulkDeleteOrdersSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order selection");
  await deleteOrders(parsed.data.ids);
  res.json({ deleted: parsed.data.ids.length });
});

orderRouter.delete("/admin/orders/:id", async (req, res) => {
  await deleteOrder(req.params.id);
  res.status(204).end();
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
