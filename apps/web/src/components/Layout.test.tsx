import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { Layout } from "./Layout";

describe("Layout", () => {
  afterEach(cleanup);

  it("provides navigation, skip link, and cart destination while ordering is enabled", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["storefront-settings"], { orderingEnabled: true });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Layout>
            <p>Page</p>
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cart/i })).toHaveAttribute("href", "/cart");
    expect(screen.getByText("Founded in 2020")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /instagram/i })).toHaveAttribute("href", "https://www.instagram.com/qleaves.qa?igsi=MWh6YzR4dWMyazA0cw==");
    expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute("href", "https://wa.me/97477551056");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Shipping & Returns" })).toHaveAttribute("href", "/shipping-returns");
    expect(screen.getByText("QOZYD").tagName).toBe("STRONG");
  });

  it("hides the cart destination when ordering is disabled", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnMount: false } } });
    client.setQueryData(["storefront-settings"], { orderingEnabled: false });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><Layout><p>Page</p></Layout></MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByRole("link", { name: /cart/i })).not.toBeInTheDocument());
  });
});
