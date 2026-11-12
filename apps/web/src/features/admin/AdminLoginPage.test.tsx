import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../../app/providers";
import { AdminLoginPage } from "./AdminLoginPage";
import { adminApi } from "./admin-api";
import { ApiClientError } from "../../lib/api-error";

vi.mock("./admin-api", () => ({
  adminApi: { login: vi.fn(), session: vi.fn(), logout: vi.fn(), products: vi.fn(), updateProduct: vi.fn() },
}));

describe("AdminLoginPage", () => {
  beforeEach(() => {
    localStorage.removeItem("qleaves-language");
    vi.mocked(adminApi.login).mockResolvedValue({ name: "QLeaves Admin" });
  });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("authenticates with a password only", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <Providers client={client}>
        <MemoryRouter initialEntries={["/admin/login"]}>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin" element={<p>Dashboard</p>} />
          </Routes>
        </MemoryRouter>
      </Providers>,
    );

    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(vi.mocked(adminApi.login).mock.calls[0]?.[0]).toBe("secret");
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });

  it("reveals and hides the password with the eye button", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <Providers client={client}>
        <MemoryRouter initialEntries={["/admin/login"]}><AdminLoginPage /></MemoryRouter>
      </Providers>,
    );
    const field = screen.getByLabelText("Password");
    await userEvent.type(field, "secret");
    expect(field).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
    expect(field).toHaveValue("secret");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(field).toHaveAttribute("type", "password");
  });

  it("has no language switch but follows the language chosen on the site", () => {
    localStorage.setItem("qleaves-language", "ar");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <Providers client={client}>
        <MemoryRouter initialEntries={["/admin/login"]}>
          <AdminLoginPage />
        </MemoryRouter>
      </Providers>,
    );

    expect(screen.queryByTestId("language-toggle")).not.toBeInTheDocument();
    expect(screen.getByLabelText("كلمة المرور")).toBeInTheDocument();
    expect(screen.getByTestId("admin-login-page")).toHaveAttribute("dir", "rtl");
  });

  it("never shows a database outage as a wrong password, in English or Arabic", async () => {
    for (const language of ["en", "ar"] as const) {
      localStorage.setItem("qleaves-language", language);
      vi.mocked(adminApi.login).mockRejectedValueOnce(new ApiClientError("The shop is briefly unavailable", "DATABASE_UNAVAILABLE", "req_7", 503));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(<Providers client={client}><MemoryRouter initialEntries={["/admin/login"]}><AdminLoginPage /></MemoryRouter></Providers>);
      await userEvent.type(screen.getByLabelText(language === "ar" ? "كلمة المرور" : "Password"), "secret");
      await userEvent.click(screen.getByRole("button", { name: language === "ar" ? /دخول/ : /sign in/i }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(language === "ar" ? /غير متاح مؤقتًا/ : /briefly unavailable/i);
      expect(alert).not.toHaveTextContent(/password|كلمة المرور/i);
      cleanup();
    }
  });

  it("says plainly when the password is wrong", async () => {
    vi.mocked(adminApi.login).mockRejectedValueOnce(new ApiClientError("Invalid credentials", "INVALID_CREDENTIALS", undefined, 401));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<Providers client={client}><MemoryRouter initialEntries={["/admin/login"]}><AdminLoginPage /></MemoryRouter></Providers>);
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That password is not correct.");
  });
});
