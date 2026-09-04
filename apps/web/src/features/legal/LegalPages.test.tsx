import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { PrivacyPage, ShippingReturnsPage, TermsPage } from "./LegalPages";

function renderPage(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe("legal pages", () => {
  it("explains the customer data collected at checkout", () => {
    renderPage(<PrivacyPage />);

    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
    expect(screen.getByText(/name, phone number, email address/i)).toBeInTheDocument();
    expect(screen.getByText(/advertising or analytics tracking cookies/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contact qleaves on whatsapp/i })).toHaveAttribute(
      "href",
      "https://wa.me/97477551056",
    );
  });

  it("states the storefront order and payment terms without inventing a return window", () => {
    renderPage(<TermsPage />);

    expect(screen.getByRole("heading", { name: "Terms & Conditions" })).toBeInTheDocument();
    expect(screen.getByText(/cash on delivery/i)).toBeInTheDocument();
    expect(screen.getByText(/payment link/i)).toBeInTheDocument();
    expect(screen.queryByText(/7 days/i)).not.toBeInTheDocument();
  });

  it("explains delivery, cancellation, and issue reporting without a fixed deadline", () => {
    renderPage(<ShippingReturnsPage />);

    expect(screen.getByRole("heading", { name: "Shipping & Returns" })).toBeInTheDocument();
    expect(screen.getAllByText(/order number/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/natural variation/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/within 7 days/i)).not.toBeInTheDocument();
  });
});
