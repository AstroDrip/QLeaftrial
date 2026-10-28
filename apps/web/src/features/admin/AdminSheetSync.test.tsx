import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminDashboardPage } from "./AdminDashboardPage";
import { adminApi } from "./admin-api";

vi.mock("./admin-api", () => ({
  adminApi: { dashboard: vi.fn(), sheetsStatus: vi.fn(), syncSheets: vi.fn(), updateOrderingEnabled: vi.fn(), updateBusinessSettings: vi.fn() },
}));

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["storefront-settings"], { orderingEnabled: true, commercialRegistration: null, ecommerceLicense: null, businessAddress: null, supportEmail: null, supportPhone: null, deliveryFeeQar: 25 });
  render(<QueryClientProvider client={client}><MemoryRouter><AdminDashboardPage /></MemoryRouter></QueryClientProvider>);
}

describe("Google Sheet card on the dashboard", () => {
  beforeEach(() => vi.mocked(adminApi.dashboard).mockResolvedValue({ ordersToday: 0, liveInventory: 0, lowStock: 0, pendingPayoutsQar: 0 }));
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("explains that it is not set up and offers no sync button", async () => {
    vi.mocked(adminApi.sheetsStatus).mockResolvedValue({ configured: false });
    renderDashboard();

    expect(await screen.findByText(/Not set up yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync all orders now" })).not.toBeInTheDocument();
  });

  it("links to the sheet and syncs every order on demand", async () => {
    vi.mocked(adminApi.sheetsStatus).mockResolvedValue({ configured: true, tab: "Orders", sheetUrl: "https://docs.google.com/spreadsheets/d/abc" });
    vi.mocked(adminApi.syncSheets).mockResolvedValue({ synced: 3 });
    renderDashboard();

    expect(await screen.findByText('Connected to the "Orders" tab.')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open sheet" })).toHaveAttribute("href", "https://docs.google.com/spreadsheets/d/abc");
    fireEvent.click(screen.getByRole("button", { name: "Sync all orders now" }));

    expect(await screen.findByText("Synced 3 orders.")).toBeInTheDocument();
  });

  it("tells the admin when the sync fails", async () => {
    vi.mocked(adminApi.sheetsStatus).mockResolvedValue({ configured: true, tab: "Orders" });
    vi.mocked(adminApi.syncSheets).mockRejectedValue(new Error("Could not update the Google Sheet"));
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: "Sync all orders now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/The sync failed/);
  });
});
