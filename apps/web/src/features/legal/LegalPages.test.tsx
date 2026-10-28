import { cleanup, render, screen } from "@testing-library/react";
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
    cleanup();
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
      "https://wa.me/97452040988",
    );
  });

  it("states the storefront order and payment terms without inventing a return window", () => {
    renderPage(<TermsPage />);

    expect(screen.getByRole("heading", { name: "Terms & Conditions" })).toBeInTheDocument();
    expect(screen.getAllByText(/cash on delivery/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/payment link/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/7 days/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Decree-Law No. 16 of 2010/)).toBeInTheDocument();
  });

  it("explains customer rights under Qatar's personal data law", () => {
    renderPage(<PrivacyPage />);

    expect(screen.getByText(/Law No. 13 of 2016/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your rights" })).toBeInTheDocument();
    expect(screen.getByText(/receive a copy/i)).toBeInTheDocument();
  });

  it("hides business details that have not been entered instead of showing placeholders", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ orderingEnabled: true, commercialRegistration: null, ecommerceLicense: null, businessAddress: null, supportEmail: null, supportPhone: null, deliveryFeeQar: 20 }),
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><AboutPage /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByRole("heading", { name: "Customer support" })).toBeInTheDocument();
    expect(screen.queryByText(/to be provided/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Business identity and licensing" })).not.toBeInTheDocument();
    client.clear();
  });

  it("explains delivery, cancellation, and issue reporting without a fixed deadline", () => {
    renderPage(<ShippingReturnsPage />);

    expect(screen.getByRole("heading", { name: "Shipping & Returns" })).toBeInTheDocument();
    expect(screen.getAllByText(/order number/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/natural variation/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/within 7 days/i)).not.toBeInTheDocument();
  });
});
