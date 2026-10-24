import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutPage, PrivacyPage, ShippingReturnsPage, TermsPage } from "./LegalPages";

function renderPage(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe("legal pages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows business registration details and customer policy documents on About us", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderingEnabled: true,
        commercialRegistration: "CR-12345",
        ecommerceLicense: "EC-67890",
        businessAddress: "Doha, Qatar",
        supportEmail: "hello@qleaves.qa",
        supportPhone: "+974 1234 5678",
        deliveryFeeQar: 20,
      }),
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><AboutPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "About us" })).toBeInTheDocument();
    expect(await screen.findByText("CR-12345")).toBeInTheDocument();
    expect(screen.getByText("EC-67890")).toBeInTheDocument();
    expect(screen.getByText("Doha, Qatar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Shipping & Returns" })).toHaveAttribute("href", "/shipping-returns");
    client.clear();
  });

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
