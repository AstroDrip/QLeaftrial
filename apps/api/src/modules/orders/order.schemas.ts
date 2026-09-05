import { z } from "zod";

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(40),
  email: z.string().email().max(200),
  addressLine1: z.string().trim().min(3).max(240),
  area: z.string().trim().min(2).max(100),
  deliveryNotes: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(["COD", "PAYMENT_LINK"]),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive().max(100) })).min(1).max(50),
}).strict();

export const updateOrderStatusSchema = z.object({
  // Accept Semi's vocabulary while retaining QLeaves' persisted enum.
  status: z.enum(["PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "pending", "accepted", "declined", "completed"]),
}).strict();

export const updatePaymentStatusSchema = z.object({
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED"]),
}).strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const bulkDeleteOrdersSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(100),
}).strict();

export type BulkDeleteOrdersInput = z.infer<typeof bulkDeleteOrdersSchema>;
