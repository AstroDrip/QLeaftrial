import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminInvoicePage } from "./AdminInvoicePage";
import { AdminInvoicesPage } from "./AdminInvoicesPage";
import { adminApi, type AdminOrder } from "./admin-api";

vi.mock("./admin-api", () => ({ adminApi: { orders: vi.fn() } }));

function order(id: string, overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id, orderNumber: `QL-${id}`, customerName: `Customer ${id}`, phone: "+974 5555 1234", email: "c@example.com", addressLine1: "Villa 1, Street 30", area: "Doha",
    paymentMethod: "COD", subtotalQar: 200, deliveryFeeQar: 25, status: "DELIVERED", paymentStatus: "PAID", createdAt: "2026-10-28T09:00:00Z", deliveryNotes: null,
    items: [{ id: `${id}-1`, productId: "p1", productName: "Areca Palm", sku: "SP-1", quantity: 2, unitPriceQar: 100 }], ...overrides,
  };
}

function client() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["storefront-settings"], { orderingEnabled: true, commercialRegistration: "CR-123", ecommerceLicense: null, businessAddress: "Doha, Qatar", supportEmail: null, supportPhone: null, deliveryFeeQar: 25 });
  return queryClient;
}

describe("admin invoices", () => {
  beforeEach(() => vi.mocked(adminApi.orders).mockResolvedValue([
    order("a"), order("b", { paymentStatus: "PENDING", createdAt: "2026-10-27T10:00:00Z" }), order("c", { status: "CANCELLED" }),
  ]));
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("lists invoices by day, skips declined orders and filters by payment", async () => {
    render(<QueryClientProvider client={client()}><MemoryRouter><AdminInvoicesPage /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByText("INV-QL-a")).toBeInTheDocument();
    expect(screen.getByText("INV-QL-b")).toBeInTheDocument();
    expect(screen.queryByText("INV-QL-c")).not.toBeInTheDocument();
    expect(screen.getAllByRole("region").length).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Unpaid" }));
    expect(screen.queryByText("INV-QL-a")).not.toBeInTheDocument();
    expect(screen.getByText("INV-QL-b")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-28" } });
    expect(screen.getByText("No invoices match these filters.")).toBeInTheDocument();
  });

  it("shows a printable invoice with business details, items and totals", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/admin/invoices/a"]}><Routes><Route path="/admin/invoices/:orderId" element={<AdminInvoicePage />} /></Routes></MemoryRouter>
      </QueryClientProvider>,
    );

    const invoice = await screen.findByTestId("invoice");
    expect(within(invoice).getByText("INV-QL-a")).toBeInTheDocument();
    expect(within(invoice).getByText("Commercial Registration: CR-123")).toBeInTheDocument();
    expect(within(invoice).getByText("Customer a")).toBeInTheDocument();
    expect(within(invoice).getByText("Areca Palm")).toBeInTheDocument();
    expect(within(invoice).getByText("225 QAR")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Print / save as PDF" }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("refuses to show an invoice for a declined order or an unknown id", async () => {
    const view = (id: string) => render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={[`/admin/invoices/${id}`]}><Routes><Route path="/admin/invoices/:orderId" element={<AdminInvoicePage />} /></Routes></MemoryRouter>
      </QueryClientProvider>,
    );

    view("c");
    expect(await screen.findByText("Declined orders do not have an invoice.")).toBeInTheDocument();
    expect(screen.queryByTestId("invoice")).not.toBeInTheDocument();
    cleanup();
    view("zzz");
    expect(await screen.findByText("This invoice could not be found.")).toBeInTheDocument();
  });
});
