import { z } from "zod";

// The areas checkout offers, as the storefront sends them (English or Arabic label).
export const DELIVERY_AREAS = ["Doha", "Al Rayyan", "Al Wakrah", "Al Khor", "الدوحة", "الريان", "الوكرة", "الخور"] as const;

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(40),
  email: z.string().email().max(200),
  addressLine1: z.string().trim().min(3).max(240),
  area: z.string().trim().refine((value) => (DELIVERY_AREAS as readonly string[]).includes(value), "We deliver to Doha, Al Rayyan, Al Wakrah and Al Khor"),
  deliveryNotes: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(["COD", "PAYMENT_LINK"]),
  // Delivery is no longer priced. Older cached storefront pages may still send this; it is ignored.
  deliveryFeeQar: z.number().int().nonnegative().optional(),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().positive().max(100) })).min(1).max(50),
}).strict();

export const updateOrderStatusSchema = z.object({
  // Accept Semi's vocabulary while retaining QLeaves' persisted enum.
  status: z.enum(["PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "pending", "accepted", "declined", "completed"]),
}).strict();

// The delivery charge agreed with the customer, in whole QAR like every other price (0 allowed).
export const confirmDeliveryFeeSchema = z.object({
  deliveryFeeQar: z.number().int().nonnegative().max(1000),
}).strict();

export const updatePaymentStatusSchema = z.object({
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED"]),
}).strict();

export const acceptEditedOrderSchema = z.object({
  items: z.array(z.object({
    orderItemId: z.string().trim().min(1),
    included: z.boolean(),
    productId: z.string().trim().min(1),
    quantity: z.number().int().positive().max(100),
  }).strict()).min(1).max(50),
}).strict();

export const deleteOrdersSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(100),
}).strict().refine((value) => new Set(value.ids).size === value.ids.length, {
  message: "Order IDs must be unique",
  path: ["ids"],
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type AcceptEditedOrderInput = z.infer<typeof acceptEditedOrderSchema>;

export const bulkDeleteOrdersSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(100),
}).strict();

export type BulkDeleteOrdersInput = z.infer<typeof bulkDeleteOrdersSchema>;
