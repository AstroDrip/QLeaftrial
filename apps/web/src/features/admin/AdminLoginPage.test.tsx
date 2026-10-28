import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../../app/providers";
import { AdminLoginPage } from "./AdminLoginPage";
import { adminApi } from "./admin-api";

vi.mock("./admin-api", () => ({
  adminApi: { login: vi.fn(), session: vi.fn(), logout: vi.fn(), products: vi.fn(), updateProduct: vi.fn() },
}));

describe("AdminLoginPage", () => {
  beforeEach(() => {
    localStorage.removeItem("qleaves-language");
    vi.mocked(adminApi.login).mockResolvedValue({ name: "QLeaves Admin" });
  });
  afterEach(() => localStorage.clear());

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
    await userEvent.type(screen.getByLabelText(/password/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(vi.mocked(adminApi.login).mock.calls[0]?.[0]).toBe("secret");
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
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
});
