import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../../app/providers";
import { AdminLayout } from "./AdminLayout";
import { adminApi } from "./admin-api";

vi.mock("./admin-api", () => ({
  adminApi: { session: vi.fn(), logout: vi.fn() },
}));

describe("AdminLayout", () => {
  beforeEach(() => {
    localStorage.removeItem("qleaves-language");
    vi.mocked(adminApi.session).mockResolvedValue({ name: "QLeaves Admin" });
  });
  afterEach(() => localStorage.clear());

  it("switches the admin dashboard language and direction", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <Providers client={client}>
        <MemoryRouter initialEntries={["/admin"]}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<p>Dashboard content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Providers>,
    );

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    const languageToggle = screen.getByTestId("language-toggle").querySelector("input");
    expect(languageToggle).not.toBeNull();

    await userEvent.click(languageToggle!);

    expect(languageToggle).toBeChecked();
    expect(screen.getByRole("link", { name: /المنتجات/ })).toHaveAttribute("href", "/admin/products");
    expect(screen.getByTestId("admin-layout")).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("admin-layout")).toHaveAttribute("lang", "ar");
  });
});
