import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationStatusChip, OrderLocation, locationStatus } from "./OrderLocation";
import type { AdminOrder } from "./admin-api";

vi.mock("../map/QatarMap", () => ({ default: () => <p>map</p> }));

const base = { id: "o1", orderNumber: "QL-1" } as AdminOrder;
const located = {
  ...base,
  deliveryLocation: {
    latitude: 25.2867123, longitude: 51.5333456, formattedAddress: "Ali Bin Abdulla Street, Souq Waqif, Qatar", source: "gps", precision: "gps",
    accuracyMeters: 18.4, area: "Souq Waqif", zone: "3", street: "Ali Bin Abdulla Street", building: null, unit: "Flat 4", landmark: null,
    confirmedAt: "2026-11-13T10:00:00.000Z",
  },
} as AdminOrder;

describe("admin order location", () => {
  afterEach(cleanup);

  it("shows the saved address, coordinates and details, and only the details that were given", () => {
    render(<OrderLocation order={located} isArabic={false} />);
    // Once in the card, once in the (closed) larger-map dialog.
    expect(screen.getAllByText("Ali Bin Abdulla Street, Souq Waqif, Qatar").length).toBeGreaterThan(0);
    expect(screen.getByText("25.286712, 51.533346")).toBeInTheDocument();
    expect(screen.getByText("±18 m")).toBeInTheDocument();
    expect(screen.getByText("Flat 4")).toBeInTheDocument();
    expect(screen.queryByText("Building")).not.toBeInTheDocument();
    expect(screen.queryByText("Landmark")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Open in Google Maps" });
    expect(link).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=25.286712%2C51.533346");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    // The map only loads when asked for.
    expect(screen.queryByText("map")).not.toBeInTheDocument();
  });

  it("says plainly when an order has no recorded location, or only a written address", () => {
    expect(locationStatus(base)).toBe("missing");
    expect(locationStatus({ ...base, deliveryLocationManual: true } as AdminOrder)).toBe("manual");
    expect(locationStatus(located)).toBe("confirmed");

    render(<OrderLocation order={base} isArabic={false} />);
    expect(screen.getByText("Delivery location was not recorded for this order.")).toBeInTheDocument();
    expect(screen.queryByText(/Coordinates/)).not.toBeInTheDocument();
    cleanup();
    render(<><LocationStatusChip order={{ ...base, deliveryLocationManual: true } as AdminOrder} isArabic={false} /><OrderLocation order={{ ...base, deliveryLocationManual: true } as AdminOrder} isArabic={false} /></>);
    expect(screen.getByText("Written address only")).toBeInTheDocument();
    expect(screen.getByText(/confirm the location with them/)).toBeInTheDocument();
  });
});
