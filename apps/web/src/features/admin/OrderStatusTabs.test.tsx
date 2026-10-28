import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { OrderStatusTabs, statusTabColumns, type StatusTab } from "./OrderStatusTabs";

type Status = "PENDING" | "CONFIRMED" | "CANCELLED" | "DELIVERED";
const tabs: Array<StatusTab<Status>> = [
  { value: "PENDING", label: "Pending", count: 3, tone: "pending" },
  { value: "CONFIRMED", label: "Accepted", count: 1, tone: "accepted" },
  { value: "CANCELLED", label: "Declined", count: 0, tone: "declined" },
  { value: "DELIVERED", label: "Completed", count: 7, tone: "completed" },
];

function Harness() {
  const [active, setActive] = useState<Status>("PENDING");
  return <OrderStatusTabs tabs={tabs} active={active} onChange={setActive} label="Order status" panelId="panel" />;
}

describe("OrderStatusTabs", () => {
  afterEach(cleanup);

  it("gives the active tab the flexible column and 44px to the others", () => {
    expect(statusTabColumns(4, 0)).toBe("minmax(0, 1fr) 44px 44px 44px");
    expect(statusTabColumns(4, 2)).toBe("44px 44px minmax(0, 1fr) 44px");
  });

  it("exposes a named tablist with full labels and counts, starting on Pending", () => {
    render(<Harness />);

    expect(screen.getByRole("tablist", { name: "Order status" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pending (3)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Completed (7)" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tablist").style.getPropertyValue("--status-columns")).toBe("minmax(0, 1fr) 44px 44px 44px");
  });

  it("moves selection, focus and the flexible column with the keyboard", () => {
    render(<Harness />);
    const pending = screen.getByRole("tab", { name: "Pending (3)" });
    pending.focus();

    fireEvent.keyDown(pending, { key: "ArrowRight" });
    const accepted = screen.getByRole("tab", { name: "Accepted (1)" });
    expect(accepted).toHaveAttribute("aria-selected", "true");
    expect(accepted).toHaveFocus();
    expect(screen.getByRole("tablist").style.getPropertyValue("--status-columns")).toBe("44px minmax(0, 1fr) 44px 44px");

    fireEvent.keyDown(accepted, { key: "End" });
    expect(screen.getByRole("tab", { name: "Completed (7)" })).toHaveAttribute("aria-selected", "true");
  });
});
