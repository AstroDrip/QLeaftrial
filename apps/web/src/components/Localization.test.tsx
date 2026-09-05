import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Providers } from "../app/providers";
import { Layout } from "./Layout";

describe("runtime localization", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    document.body.dir = "ltr";
  });

  it("switches navigation and document direction while keeping QLeaves footer English/LTR", async () => {
    render(
      <Providers>
        <MemoryRouter>
          <Layout><p>Page</p></Layout>
        </MemoryRouter>
      </Providers>,
    );

    await userEvent.click(screen.getByTestId("language-toggle"));

    expect(screen.getByRole("link", { name: "المتجر" })).toHaveAttribute("href", "/shop");
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("site-footer")).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("Founded in 2020")).toBeInTheDocument();
    expect(screen.getByLabelText("QLeaves home")).toHaveAttribute("dir", "ltr");
  });
});
