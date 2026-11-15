import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderDeliveryAndSheet } from "./OrderDeliveryAndSheet";
import { adminApi, type AdminOrder, type OrderNotification } from "./admin-api";

vi.mock("./admin-api", () => ({ adminApi: { retryNotification: vi.fn(), confirmDeliveryFee: vi.fn(), syncOrderToSheet: vi.fn() } }));

const order = (status: OrderNotification["status"] | null) => ({
  id: "o1", orderNumber: "QL-1", status: "PENDING", deliveryFeeQar: 0,
  ...(status ? { notifications: [{ id: "n1", eventType: "ORDER_CREATED", status, attempts: 1 }] } : {}),
}) as AdminOrder;

function show(value: AdminOrder, isArabic = false) {
  return render(<QueryClientProvider client={new QueryClient()}><OrderDeliveryAndSheet order={value} isArabic={isArabic} /></QueryClientProvider>);
}

describe("order email status in admin", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("says whether the shop's email for the order was sent, is waiting, or is not set up", () => {
    show(order("SENT"));
    expect(screen.getByTestId("order-email-status")).toHaveTextContent("Order email sent");
    cleanup();
    show(order("PENDING"));
    expect(screen.getByTestId("order-email-status")).toHaveTextContent("Order email waiting to be sent");
    cleanup();
    show(order("DISABLED"), true);
    expect(screen.getByTestId("order-email-status")).toHaveTextContent("بريد الطلبات غير مُعدّ");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    cleanup();
    // Orders placed before emails existed show nothing.
    const { container } = show(order(null));
    expect(container).toBeEmptyDOMElement();
  });

  it("offers to send a failed email again", async () => {
    vi.mocked(adminApi.retryNotification).mockResolvedValue({ id: "n1", eventType: "ORDER_CREATED", status: "SENT", attempts: 1 });
    show(order("FAILED"));
    expect(screen.getByTestId("order-email-status")).toHaveTextContent("Order email was not delivered");
    await userEvent.click(screen.getByRole("button", { name: "Send again" }));
    await waitFor(() => expect(adminApi.retryNotification).toHaveBeenCalledWith("n1"));
  });
});
