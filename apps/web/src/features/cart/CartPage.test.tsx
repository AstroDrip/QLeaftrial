import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CartPage } from "./CartPage";
import { useCartStore } from "./cart-store";

describe("CartPage", () => {
  afterEach(cleanup);
  beforeEach(() => {
    useCartStore.setState({
      items: [
        {
          id: "plant-1",
          slug: "house-plant",
          name: "House Plant",
          priceQar: 180,
          stock: 12,
          image: { url: "/house.jpg", altText: "House plant" },
          quantity: 2,
        },
      ],
    });
  });

  it("renders totals from the shared cart store", () => {
    render(
      <MemoryRouter>
        <CartPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "House Plant" })).toBeInTheDocument();
    // One total, no separate item count, and the old "item(s)" wording is gone.
    expect(screen.getAllByText("360 QAR")).toHaveLength(1);
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.queryByText(/item\(s\)/)).not.toBeInTheDocument();
    expect(screen.queryByText("Subtotal")).not.toBeInTheDocument();
  });

  it("removes an item with an icon button that is still named for screen readers", async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);

    const remove = screen.getByRole("button", { name: "Remove: House Plant" });
    expect(remove).not.toHaveTextContent(/\S/);
    expect(remove.querySelector("svg")).not.toBeNull();
    await userEvent.click(remove);

    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it("does not remove an item while its quantity field is temporarily empty", async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await userEvent.clear(screen.getByRole("textbox", { name: /house plant quantity/i }));
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);
  });

  it("has a minus and a plus on either side of the number instead of arrow spinners", async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);

    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    const group = screen.getByRole("group", { name: /house plant quantity/i });
    const [minus, field, plus] = [...group.children] as HTMLElement[];
    expect(minus).toHaveAccessibleName("Decrease House Plant");
    expect(plus).toHaveAccessibleName("Increase House Plant");
    expect(field).toHaveValue("2");

    await userEvent.click(plus);
    expect(useCartStore.getState().items[0]?.quantity).toBe(3);
    await userEvent.click(minus);
    await userEvent.click(minus);
    expect(useCartStore.getState().items[0]?.quantity).toBe(1);
    // At one plant the minus stops; the trash icon is how a plant is taken out.
    expect(minus).toBeDisabled();
  });

  it("stops the plus at the stock available and only accepts digits when typing", async () => {
    useCartStore.setState({ items: [{ ...useCartStore.getState().items[0], quantity: 11 }] });
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    const group = screen.getByRole("group", { name: /house plant quantity/i });
    const [, field, plus] = [...group.children] as HTMLElement[];

    await userEvent.click(plus);
    expect(plus).toBeDisabled();
    expect(useCartStore.getState().items[0]?.quantity).toBe(12);

    await userEvent.type(field, "abc");
    expect(field).toHaveValue("12");
  });

  function cartAfter(entries: string[]) {
    return render(
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/cart" element={<CartPage />} />
          <Route path="/shop" element={<p>Shop page</p>} />
          <Route path="/plants/aloe" element={<p>Aloe page</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("slides in as a sheet and puts focus on its heading", () => {
    cartAfter(["/shop", "/cart"]);
    expect(screen.getByTestId("cart-page")).toHaveClass("cart-page--sheet");
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("closes with the close button back to the page the customer came from", async () => {
    cartAfter(["/plants/aloe", "/cart"]);
    await userEvent.click(screen.getByRole("button", { name: "Close cart" }));
    expect(screen.getByTestId("cart-page")).toHaveClass("is-leaving");
    await waitFor(() => expect(screen.getByText("Aloe page")).toBeInTheDocument());
  });

  it("closes with Escape, and goes to the shop when the cart was opened directly", async () => {
    cartAfter(["/cart"]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByText("Shop page")).toBeInTheDocument());
  });

  it("leaves Escape to a field that has focus", async () => {
    cartAfter(["/shop", "/cart"]);
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByTestId("cart-page")).not.toHaveClass("is-leaving");
    field.remove();
  });

  it("shows the free-delivery progress with the totals, against the shop's own threshold", () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    const summary = screen.getByRole("heading", { name: /summary/i }).closest("aside")!;
    expect(summary.querySelector(".free-delivery--summary")).not.toBeNull();
    expect(summary).toHaveTextContent("150 / 150 QAR");
  });
});
