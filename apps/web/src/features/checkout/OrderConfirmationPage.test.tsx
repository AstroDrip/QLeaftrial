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
    // 150 QAR or more: delivery is free, so the subtotal and the total are the same.
    expect(screen.getAllByText("370 QAR")).toHaveLength(2);
    expect(screen.getByTestId("delivery-line")).toHaveTextContent("DeliveryFree");
    expect(screen.queryByTestId("delivery-charge-notice")).not.toBeInTheDocument();
    expect(screen.queryByText(/Monstera/)).not.toBeInTheDocument();
  });

  it("says the team will confirm the delivery charge for an order below 150 QAR", () => {
    const small = { ...summary, orderNumber: "QL-20261113-SMALL1", items: [{ name: "Golden Pothos", nameAr: null, quantity: 1, unitPriceQar: 80 }], subtotalQar: 80, deliveryChargePending: true };
    renderAt(`/order/${small.orderNumber}`, { order: small });
    expect(screen.getByTestId("delivery-line")).toHaveTextContent("DeliveryTo be confirmed");
    expect(screen.getByText("Total before delivery")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-charge-notice")).toHaveTextContent("Our team will contact you to confirm the delivery charge");
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
