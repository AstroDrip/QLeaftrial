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

  it("switches navigation and document direction including footer details", async () => {
    render(
      <Providers>
        <MemoryRouter>
          <Layout><p>Page</p></Layout>
        </MemoryRouter>
      </Providers>,
    );

    const languageSwitch = screen.getByTestId("language-toggle").querySelector("input");
    expect(languageSwitch).not.toBeNull();
    expect(languageSwitch).not.toBeChecked();
    expect(screen.getByText("EN")).toBeInTheDocument();
    expect(screen.getByText("AR")).toBeInTheDocument();
    expect(document.querySelector(".language-toggle")).toBeNull();
    expect(document.querySelector(".language-toggle__track")).toBeNull();
    expect(screen.getAllByRole("link", { name: "About us" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "About us" }).every((link) => link.getAttribute("href") === "/about")).toBe(true);

    await userEvent.click(languageSwitch!);

    expect(languageSwitch).toBeChecked();
    expect(screen.getByRole("link", { name: "المتجر" })).toHaveAttribute("href", "/shop");
    expect(screen.getAllByRole("link", { name: "من نحن" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "من نحن" }).every((link) => link.getAttribute("href") === "/about")).toBe(true);
    expect(document.documentElement).toHaveAttribute("lang", "ar");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("site-footer")).toHaveAttribute("dir", "rtl");
    expect(screen.getByTestId("site-footer")).toHaveAttribute("lang", "ar");
    expect(screen.getByText("تأسست في 2020")).toBeInTheDocument();
    expect(screen.getByLabelText("QLeaves home")).toHaveAttribute("dir", "ltr");
  });
});
