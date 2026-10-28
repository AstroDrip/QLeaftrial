import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../../app/providers";
import { PublicInvoicePage } from "./PublicInvoicePage";

const invoice = {
  id: "o1", orderNumber: "QL-20261028-AAA111", createdAt: "2026-10-28T09:00:00Z", customerName: "Aisha Al-Mansoori", phone: "+974 5555 1234",
  addressLine1: "Villa 12, Street 30", area: "Doha", deliveryNotes: null, paymentMethod: "COD", paymentStatus: "PAID", status: "DELIVERED",
  subtotalQar: 200, deliveryFeeQar: 0,
  items: [{ id: "i1", productName: "Areca Palm", sku: "SP-1", unitPriceQar: 100, quantity: 2 }],
};

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["storefront-settings"], { orderingEnabled: true, commercialRegistration: "CR-123", ecommerceLicense: null, businessAddress: "Doha, Qatar", supportEmail: null, supportPhone: null });
  render(
    <Providers client={client}>
      <MemoryRouter initialEntries={[url]}><Routes><Route path="/invoice/:orderNumber" element={<PublicInvoicePage />} /></Routes></MemoryRouter>
    </Providers>,
  );
}

describe("public invoice page", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("shows the customer's invoice when the link carries a valid token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => invoice });
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/invoice/QL-20261028-AAA111?token=abc123");

    const document = await screen.findByTestId("invoice");
    expect(within(document).getByText("INV-QL-20261028-AAA111")).toBeInTheDocument();
    expect(within(document).getByText("Areca Palm")).toBeInTheDocument();
    expect(within(document).queryByText("Delivery")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print / save as PDF" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/invoices/QL-20261028-AAA111?token=abc123");
  });

  it("explains an invalid link without showing any order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: { code: "INVOICE_NOT_FOUND", message: "Invoice not found" } }) }));
    renderAt("/invoice/QL-20261028-AAA111?token=wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("This invoice link is not valid");
    expect(screen.queryByTestId("invoice")).not.toBeInTheDocument();
  });

  it("does not even ask the server when the link has no token", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/invoice/QL-20261028-AAA111");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
