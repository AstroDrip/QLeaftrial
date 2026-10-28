import type { InvoiceOrder } from "../admin/AdminInvoicePage";
import { errorFromResponse } from "../../lib/api-error";

// Customers open their invoice with the token in the link the shop sent them.
export async function fetchPublicInvoice(orderNumber: string, token: string): Promise<InvoiceOrder> {
  const response = await fetch(`/api/v1/invoices/${encodeURIComponent(orderNumber)}?token=${encodeURIComponent(token)}`);
  if (!response.ok) throw await errorFromResponse(response);
  return response.json() as Promise<InvoiceOrder>;
}
