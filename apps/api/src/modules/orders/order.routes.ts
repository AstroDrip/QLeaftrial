import { Router } from "express";
import { requireAdmin } from "../auth/auth.middleware.js";
import { ApiError } from "../../middleware/error-handler.js";
import { createOrderSchema, deleteOrdersSchema, updateOrderStatusSchema, updatePaymentStatusSchema } from "./order.schemas.js";
import { createOrder, dashboardStats, deleteOrder, deleteOrders, listOrders, salesReport, updateOrderStatus, updatePaymentStatus } from "./order.service.js";
import { publicOrderRateLimit } from "./order-rate-limit.js";

export const orderRouter = Router();
orderRouter.post("/orders", publicOrderRateLimit, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order details");
  res.status(201).json(await createOrder(parsed.data));
});
orderRouter.use("/admin/orders", requireAdmin);
orderRouter.get("/admin/orders", async (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.json({ items: await listOrders() }); });
orderRouter.delete("/admin/orders", async (req, res) => {
  const parsed = deleteOrdersSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order selection");
  await deleteOrders(parsed.data.ids);
  res.status(204).end();
});
orderRouter.patch("/admin/orders/:id/status", async (req, res) => {
  const parsed = updateOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid order status");
  res.json(await updateOrderStatus(req.params.id, parsed.data.status));
});
orderRouter.patch("/admin/orders/:id/payment", async (req, res) => {
  const parsed = updatePaymentStatusSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Invalid payment status");
  res.json(await updatePaymentStatus(req.params.id, parsed.data.paymentStatus));
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
  const from = typeof req.query.from === "string" ? new Date(`${req.query.from}T00:00:00.000Z`) : undefined;
  const to = typeof req.query.to === "string" ? new Date(`${req.query.to}T00:00:00.000Z`) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw new ApiError(400, "VALIDATION_ERROR", "Invalid sales report dates");
  res.setHeader("Cache-Control", "no-store");
  res.json(await salesReport(from, to));
});
