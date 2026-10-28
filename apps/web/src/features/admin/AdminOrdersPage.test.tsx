import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminOrdersPage } from "./AdminOrdersPage";
import { adminApi, type AdminOrder } from "./admin-api";

vi.mock("./admin-api", () => ({
  adminApi: { orders: vi.fn(), products: vi.fn(), updateOrderStatus: vi.fn(), updatePaymentStatus: vi.fn(), acceptEditedOrder: vi.fn(), deleteOrder: vi.fn(), deleteOrders: vi.fn() },
}));

function order(orderNumber: string, status: string): AdminOrder {
  return {
    id: orderNumber, orderNumber, customerName: `Customer ${orderNumber}`, phone: "+974 5555 1234",
    email: "c@example.com", addressLine1: "12 Palm Street", area: "Doha", paymentMethod: "COD",
    subtotalQar: 100, deliveryFeeQar: 0, status, paymentStatus: "PENDING", createdAt: "2026-10-27T09:00:00Z", editChanges: [], invoiceToken: "token",
    items: [{ id: `${orderNumber}-line`, productId: "plant-1", productName: "Monstera", sku: "MON", quantity: 1, unitPriceQar: 100 }],
  };
}

describe("AdminOrdersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.products).mockResolvedValue([]);
    vi.mocked(adminApi.orders).mockResolvedValue([
      order("QL-1", "CONFIRMED"),
      order("QL-2", "PREPARING"),
      order("QL-3", "OUT_FOR_DELIVERY"),
      order("QL-4", "PENDING"),
    ]);
  });
  afterEach(cleanup);

  it("keeps preparing and out-for-delivery orders under the Accepted tab", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><AdminOrdersPage /></MemoryRouter></QueryClientProvider>);

    const acceptedTab = await screen.findByRole("tab", { name: "Accepted (3)" });
    expect(screen.getByRole("tab", { name: "Pending (1)" })).toBeInTheDocument();
    await userEvent.click(acceptedTab);

    expect(screen.getByTestId("order-QL-1")).toBeInTheDocument();
    expect(within(screen.getByTestId("order-QL-2")).getByText("Preparing")).toBeInTheDocument();
    expect(within(screen.getByTestId("order-QL-3")).getByText("Out for delivery")).toBeInTheDocument();
    expect(within(screen.getByTestId("order-QL-3")).getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(screen.queryByTestId("order-QL-4")).not.toBeInTheDocument();
  });

  it("links every non-declined order to its invoice", async () => {
    vi.mocked(adminApi.orders).mockResolvedValue([order("QL-1", "CONFIRMED"), order("QL-9", "CANCELLED")]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><AdminOrdersPage /></MemoryRouter></QueryClientProvider>);

    await userEvent.click(await screen.findByRole("tab", { name: /Accepted/ }));
    expect(within(screen.getByTestId("order-QL-1")).getByRole("link", { name: "Invoice" })).toHaveAttribute("href", "/admin/invoices/QL-1");
    await userEvent.click(screen.getByRole("tab", { name: /Declined/ }));
    expect(within(screen.getByTestId("order-QL-9")).queryByRole("link", { name: "Invoice" })).not.toBeInTheDocument();
  });
  it("marks an order paid or not paid with a single switch, like the product Published badge", async () => {
    vi.mocked(adminApi.orders).mockResolvedValue([order("QL-1", "CONFIRMED")]);
    vi.mocked(adminApi.updatePaymentStatus).mockResolvedValue({ ...order("QL-1", "CONFIRMED"), paymentStatus: "PAID" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><AdminOrdersPage /></MemoryRouter></QueryClientProvider>);

    await userEvent.click(await screen.findByRole("tab", { name: /Accepted/ }));
    const card = within(screen.getByTestId("order-QL-1"));
    expect(card.queryByRole("combobox")).not.toBeInTheDocument();
    const toggle = card.getByRole("button", { name: "Payment status for QL-1: Not paid" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);

    expect(vi.mocked(adminApi.updatePaymentStatus).mock.calls[0]).toEqual(["QL-1", "PAID"]);
  });

  it("sends the customer a thank-you with their invoice link, and says what changed in an edited order", async () => {
    vi.mocked(adminApi.orders).mockResolvedValue([{ ...order("QL-1", "CONFIRMED"), invoiceToken: "abc123", editChanges: [{ type: "removed", name: "Monstera", quantity: 1 }] }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><AdminOrdersPage /></MemoryRouter></QueryClientProvider>);

    await userEvent.click(await screen.findByRole("tab", { name: /Accepted/ }));
    const link = within(screen.getByTestId("order-QL-1")).getByRole("link", { name: "Notify on WhatsApp" });
    const href = link.getAttribute("href")!;
    expect(href.startsWith("https://wa.me/97455551234?text=")).toBe(true);
    const text = decodeURIComponent(href.split("?text=")[1]);
    expect(text).toContain("Thank you for choosing us");
    expect(text).toContain("• Removed: Monstera × 1");
    expect(text).toContain(`Your invoice: ${window.location.origin}/invoice/QL-1?token=abc123`);
  });

  it("tells a customer with a pending order what is being changed before it is accepted", async () => {
    vi.mocked(adminApi.orders).mockResolvedValue([order("QL-4", "PENDING")]);
    vi.mocked(adminApi.products).mockResolvedValue([{ id: "plant-1", name: "Monstera", priceQar: 100, stock: 5, published: true }] as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><AdminOrdersPage /></MemoryRouter></QueryClientProvider>);

    const card = within(await screen.findByTestId("order-QL-4"));
    const href = () => decodeURIComponent(card.getByRole("link", { name: "Notify on WhatsApp" }).getAttribute("href")!.split("?text=")[1]);
    expect(href()).toContain("we have received your order QL-4");

    await userEvent.click(card.getByRole("button", { name: "Order options" }));
    await userEvent.click(card.getByRole("button", { name: "Include" }));

    expect(href()).toContain("• Removed: Monstera × 1");
    expect(href()).not.toContain("Your invoice");
  });
});
