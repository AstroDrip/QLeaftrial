import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminSalesPage } from "./AdminSalesPage";
import { adminApi } from "./admin-api";

vi.mock("./admin-api", () => ({ adminApi: { sales: vi.fn() } }));

function renderPage() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminSalesPage /></QueryClientProvider>);
}

describe("AdminSalesPage", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("shows clear empty states instead of empty tables", async () => {
    vi.mocked(adminApi.sales).mockResolvedValue({ orders: 0, revenueQar: 0, paidRevenueQar: 0, unpaidRevenueQar: 0, topItems: [], byDay: [] });
    renderPage();

    expect(await screen.findByText("No completed orders in this range.")).toBeInTheDocument();
    expect(screen.getByText("No completed plant sales in this range.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("switches range with a pressed-state control and shows the covered dates", async () => {
    vi.mocked(adminApi.sales).mockResolvedValue({ orders: 1, revenueQar: 120, paidRevenueQar: 120, unpaidRevenueQar: 0, topItems: [{ name: "Orchid", quantity: 1 }], byDay: [{ date: "2026-10-27", orders: 1, revenueQar: 120 }] });
    renderPage();

    expect(await screen.findByText("All time")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Month" }));

    expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Reference date")).toBeInTheDocument();
    expect(adminApi.sales).toHaveBeenLastCalledWith(expect.stringMatching(/^\d{4}-\d{2}-01$/), expect.stringMatching(/^\d{4}-\d{2}-01$/));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("shows merchandise, delivery charges and the total side by side", async () => {
    vi.mocked(adminApi.sales).mockResolvedValue({
      orders: 2, revenueQar: 320, paidRevenueQar: 120, unpaidRevenueQar: 200,
      merchandiseQar: 320, deliveryQar: 15, totalQar: 335, paidTotalQar: 135, unpaidTotalQar: 200,
      topItems: [], byDay: [{ date: "2026-11-15", orders: 2, revenueQar: 320, deliveryQar: 15, totalQar: 335 }],
    });
    renderPage();
    expect(await screen.findByText("Delivery charges", { selector: "p, span, dt, strong, div" })).toBeInTheDocument();
    for (const figure of ["QAR 320", "QAR 15", "QAR 335", "QAR 135"]) expect(screen.getAllByText(figure).length).toBeGreaterThan(0);
    expect(screen.getByRole("columnheader", { name: "Total with delivery" })).toBeInTheDocument();
  });
});
