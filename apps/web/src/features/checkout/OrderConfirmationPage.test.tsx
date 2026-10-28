import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { OrderConfirmationPage } from "./OrderConfirmationPage";
import { rememberOrderSummary, type OrderSummary } from "./order-summary";

const summary: OrderSummary = {
  orderNumber: "QL-20261027-ABC123",
  items: [
    { name: "Peace Lily", nameAr: null, quantity: 2, unitPriceQar: 145 },
    { name: "Golden Pothos", nameAr: null, quantity: 1, unitPriceQar: 80 },
  ],
  subtotalQar: 370,
};

function renderAt(path: string, state?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes><Route path="/order/:orderNumber" element={<OrderConfirmationPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe("OrderConfirmationPage", () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("shows the order that was actually placed", () => {
    renderAt(`/order/${summary.orderNumber}`, { order: summary });

    expect(screen.getByText(summary.orderNumber)).toBeInTheDocument();
    expect(screen.getByText("Peace Lily × 2")).toBeInTheDocument();
    expect(screen.getByText("290 QAR")).toBeInTheDocument();
    expect(screen.getByText("Golden Pothos")).toBeInTheDocument();
    // The subtotal and the total are the same: delivery is not charged.
    expect(screen.getAllByText("370 QAR")).toHaveLength(2);
    expect(screen.queryByText(/delivery/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Monstera/)).not.toBeInTheDocument();
  });

  it("recovers the summary after a refresh", () => {
    rememberOrderSummary(summary);
    renderAt(`/order/${summary.orderNumber}`);

    expect(screen.getByText("Peace Lily × 2")).toBeInTheDocument();
  });

  it("shows no invented totals for an unknown order", () => {
    rememberOrderSummary(summary);
    renderAt("/order/QL-OTHER");

    expect(screen.getByText("QL-OTHER")).toBeInTheDocument();
    expect(screen.queryByText(/QAR/)).not.toBeInTheDocument();
    expect(screen.getByText(/We have received your order/)).toBeInTheDocument();
  });
});
