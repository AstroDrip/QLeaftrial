import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLoginPage } from "./AdminLoginPage";
import { adminApi } from "./admin-api";

vi.mock("./admin-api", () => ({
  adminApi: { login: vi.fn(), session: vi.fn(), logout: vi.fn(), products: vi.fn(), updateProduct: vi.fn() },
}));

describe("AdminLoginPage", () => {
  beforeEach(() => vi.mocked(adminApi.login).mockResolvedValue({ name: "QLeaves Admin" }));

  it("authenticates with a password only", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/admin/login"]}>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin" element={<p>Dashboard</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/password/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(vi.mocked(adminApi.login).mock.calls[0]?.[0]).toBe("secret");
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });
});
