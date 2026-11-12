import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { consumeRateLimit } from "../../lib/rate-limit.js";
import { ApiError } from "../../middleware/error-handler.js";
import { isValidInvoiceToken } from "./invoice-link.js";
import type { PrismaClient as SqlitePrismaClient } from "../../../generated/sqlite/index.js";

const db = prisma as unknown as SqlitePrismaClient;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_LOOKUPS = 60;

export const invoiceRouter = Router();

// Public, but only for someone holding the token from the link the shop sent. Unknown orders, wrong
// tokens and declined orders all look the same, so order numbers cannot be probed.
invoiceRouter.get("/invoices/:orderNumber", async (request, response) => {
  const client = request.ip || request.socket.remoteAddress || "unknown";
  const attempt = await consumeRateLimit({ limiter: "public-invoice", clientKey: client, limit: MAX_LOOKUPS, windowMs: WINDOW_MS });
  if (attempt.limited) {
    response.setHeader("Retry-After", String(attempt.retryAfterSeconds));
    throw new ApiError(429, "TOO_MANY_REQUESTS", "Too many requests. Please try again later.");
  }

  const orderNumber = Array.isArray(request.params.orderNumber) ? request.params.orderNumber[0] : request.params.orderNumber;
  const order = await db.order.findUnique({ where: { orderNumber }, include: { items: true } });
  if (!order || order.status === "CANCELLED" || !isValidInvoiceToken(order.id, request.query.token)) {
    throw new ApiError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  }

  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.json({
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    customerName: order.customerName,
    phone: order.phone,
    addressLine1: order.addressLine1,
    area: order.area,
    deliveryNotes: order.deliveryNotes,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    subtotalQar: order.subtotalQar,
    deliveryFeeQar: order.deliveryFeeQar,
    deliveryChargePending: order.deliveryChargePending,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      unitPriceQar: item.unitPriceQar,
      quantity: item.quantity,
    })),
  });
});
