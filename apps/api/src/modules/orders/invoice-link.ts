import { createHmac, timingSafeEqual } from "node:crypto";
import { linkSigningKey } from "../../lib/rate-limit.js";

// A customer's invoice link carries a token that only the server can produce for that order, so an
// order number alone never reveals an invoice. The token is derived, not stored.
export function invoiceToken(orderId: string): string {
  return createHmac("sha256", linkSigningKey()).update(`invoice-link\0${orderId}`).digest("base64url").slice(0, 32);
}

export function isValidInvoiceToken(orderId: string, token: unknown): boolean {
  if (typeof token !== "string") return false;
  const expected = Buffer.from(invoiceToken(orderId));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
