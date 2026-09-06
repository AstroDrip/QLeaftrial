import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Providers } from "../app/providers";
import { Layout } from "./Layout";

describe("Layout", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("provides navigation, skip link, and cart destination", () => {
    render(
      <MemoryRouter>
        <Layout>
          <p>Page</p>
        </Layout>
      </MemoryRouter>,
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

  it("translates the public interface to Arabic while preserving the English footer and brand", async () => {
    render(
      <Providers>
        <MemoryRouter>
          <Layout>
            <h1>محتوى الصفحة</h1>
          </Layout>
        </MemoryRouter>
      </Providers>,
    );

    await userEvent.click(screen.getByTestId("language-toggle"));

    expect(screen.getByRole("link", { name: "المتجر" })).toHaveAttribute("href", "/shop");
    expect(screen.getByRole("link", { name: "السلة" })).toHaveAttribute("href", "/cart");
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("site-footer")).toHaveAttribute("lang", "en");
    expect(screen.getByTestId("site-footer")).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("Founded in 2020")).toBeInTheDocument();
    expect(screen.getByLabelText("التبديل إلى اللغة الإنجليزية")).toBeInTheDocument();
  });
});
