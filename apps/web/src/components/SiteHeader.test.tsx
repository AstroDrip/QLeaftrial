import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../app/providers";
import { useCartStore } from "../features/cart/cart-store";
import { SiteHeader } from "./SiteHeader";

const settings = { orderingEnabled: true, commercialRegistration: null, ecommerceLicense: null, businessAddress: null, supportEmail: null, supportPhone: null, deliveryFeeQar: null };

// Pretends the screen is as narrow as the given width.
function stubScreen(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity);
    return { matches: width <= max, media: query, addEventListener: () => undefined, removeEventListener: () => undefined };
  });
}

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderHeader(path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnMount: false } } });
  client.setQueryData(["storefront-settings"], settings);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><Providers client={client}><SiteHeader /><Where /></Providers></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SiteHeader menu", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useCartStore.setState({ items: [] });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens a compact menu from the centred button with Home, Shop and About us (the cart is its own button)", async () => {
    stubScreen(390);
    const user = userEvent.setup();
    renderHeader();

    const button = screen.getByRole("button", { name: "Open menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();

    await user.click(button);

    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("navigation", { name: "Menu" });
    expect(within(menu).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Home", "/"], ["Shop", "/shop"], ["About us", "/about"],
    ]);
    expect(within(menu).getByRole("link", { name: "Home" })).toHaveClass("active");
  });

  it("closes with Escape (returning focus to the button), outside presses, and after choosing a page", async () => {
    stubScreen(390);
    const user = userEvent.setup();
    renderHeader();
    const open = () => user.click(screen.getByRole("button", { name: "Open menu" }));

    await open();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveFocus();
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();

    await open();
    await user.click(document.body);
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();

    await open();
    await user.click(within(screen.getByRole("navigation", { name: "Menu" })).getByRole("link", { name: "Shop" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/shop");
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps one cart button, with its count, whether the menu is open or closed", async () => {
    stubScreen(390);
    useCartStore.setState({ items: [{ productId: "p1", slug: "a", name: "A", priceQar: 10, quantity: 2, image: null }] } as never);
    const user = userEvent.setup();
    const { container } = renderHeader();

    const icon = () => container.querySelectorAll(".site-header__cart");
    expect(icon()).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Cart, 2 items" })).toHaveTextContent("2");
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(icon()).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Cart, 2 items" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Menu" })).queryByRole("link", { name: /cart/i })).not.toBeInTheDocument();
  });

  it("does not show the cart button on the cart page itself", () => {
    stubScreen(390);
    const { container } = renderHeader("/cart");
    expect(container.querySelector(".site-header__cart")).toBeNull();
    expect(screen.queryByRole("link", { name: /^cart,/i })).not.toBeInTheDocument();
  });

  it("puts the language switch in the menu on narrow phones only, and never twice", async () => {
    const user = userEvent.setup();

    stubScreen(390);
    const narrow = renderHeader();
    expect(screen.getAllByTestId("language-toggle")).toHaveLength(1);
    expect(narrow.container.querySelector(".site-header__actions [data-testid=language-toggle]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(within(screen.getByRole("navigation", { name: "Menu" })).getByTestId("language-toggle")).toBeInTheDocument();
    narrow.unmount();

    stubScreen(600);
    const wide = renderHeader();
    expect(screen.getAllByTestId("language-toggle")).toHaveLength(1);
    expect(wide.container.querySelector(".site-header__actions [data-testid=language-toggle]")).not.toBeNull();
  });

  it("leaves wide screens with the inline links and no menu to open", () => {
    stubScreen(1280);
    renderHeader();

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu", hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();
  });
});
