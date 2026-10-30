import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../app/providers";
import { Layout } from "./Layout";

const storefrontSettings = {
  orderingEnabled: true,
  commercialRegistration: null,
  ecommerceLicense: null,
  businessAddress: null,
  supportEmail: null,
  supportPhone: null,
  deliveryFeeQar: null,
};

function renderWithSettings(orderingEnabled: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  });
  client.setQueryData(["storefront-settings"], { ...storefrontSettings, orderingEnabled });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Layout><p>Page</p></Layout>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Layout", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("provides the skip link, navigation, cart, and bilingual legal destinations", () => {
    renderWithSettings(true);

    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute("href", "/shop");
    expect(within(screen.getByTestId("primary-nav")).getByRole("link", { name: "About us" })).toHaveAttribute("href", "/about");
    expect(within(screen.getByTestId("primary-nav")).queryByRole("link", { name: /cart/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Cart, \d+ items?$/ })).toHaveAttribute("href", "/cart");
    expect(screen.getByText("Founded in 2018")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: /instagram/i })) expect(link).toHaveAttribute("href", "https://www.instagram.com/qleaves.qa");
    for (const link of screen.getAllByRole("link", { name: /whatsapp/i })) expect(link).toHaveAttribute("href", "https://wa.me/97452040988");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Shipping & Returns" })).toHaveAttribute("href", "/shipping-returns");
    expect(screen.getByText("QOZYD").tagName).toBe("STRONG");
  });

  it("shows the brand kit's own artwork, not typed text: the full logo reversed on the dark header and footer, the icon for phones", () => {
    const { container } = renderWithSettings(true);

    const header = within(screen.getByTestId("site-header"));
    expect(header.getByRole("link", { name: /QLeaves home/ })).toHaveAttribute("href", "/");
    expect(header.getByRole("img", { name: "QLeaves" })).toBeInTheDocument();
    expect(container.querySelector(".site-header__logo-full")).toHaveAttribute("src", "/brand/qleaves-logo-white.png");
    expect(container.querySelector(".site-header__logo-icon")).toHaveAttribute("src", "/brand/qleaves-icon-white.png");
    // The old typed wordmark is gone.
    expect(container.querySelector(".site-header__wordmark")).toBeNull();
    expect(within(screen.getByTestId("site-footer")).getByRole("img", { name: "QLeaves" })).toHaveAttribute("src", "/brand/qleaves-logo-white.png");
  });

  it("hides the cart destination when ordering is disabled", () => {
    renderWithSettings(false);

    expect(screen.queryByRole("link", { name: /^Cart/ })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("primary-nav")).getByRole("link", { name: "About us" })).toHaveAttribute("href", "/about");
  });

  it("localizes public navigation and footer links into Arabic", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => storefrontSettings,
    }));
    render(
      <Providers>
        <MemoryRouter>
          <Layout><h1>محتوى الصفحة</h1></Layout>
        </MemoryRouter>
      </Providers>,
    );

    await userEvent.click(screen.getByTestId("language-toggle"));

    expect(screen.getByRole("link", { name: "المتجر" })).toHaveAttribute("href", "/shop");
    expect(within(screen.getByTestId("primary-nav")).getByRole("link", { name: "من نحن" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: /^السلة،/ })).toHaveAttribute("href", "/cart");
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("site-footer")).toHaveAttribute("lang", "ar");
    expect(screen.getByTestId("site-footer")).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("link", { name: "الخصوصية" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "الشروط والأحكام" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "الشحن والإرجاع" })).toHaveAttribute("href", "/shipping-returns");
    expect(screen.getByLabelText("التبديل إلى اللغة الإنجليزية")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("تأسست في 2018")).toBeInTheDocument());
  });
});
