import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    subtotalQar: 100, deliveryFeeQar: 20, status, paymentStatus: "PENDING", createdAt: "2026-10-27T09:00:00Z",
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
    render(<QueryClientProvider client={client}><AdminOrdersPage /></QueryClientProvider>);

    const acceptedTab = await screen.findByRole("tab", { name: "Accepted (3)" });
    expect(screen.getByRole("tab", { name: "Pending (1)" })).toBeInTheDocument();
    await userEvent.click(acceptedTab);

    expect(screen.getByTestId("order-QL-1")).toBeInTheDocument();
    expect(within(screen.getByTestId("order-QL-2")).getByText("Preparing")).toBeInTheDocument();
    expect(within(screen.getByTestId("order-QL-3")).getByText("Out for delivery")).toBeInTheDocument();
    expect(within(screen.getByTestId("order-QL-3")).getByRole("button", { name: "Complete" })).toBeInTheDocument();
    expect(screen.queryByTestId("order-QL-4")).not.toBeInTheDocument();
  });
});
