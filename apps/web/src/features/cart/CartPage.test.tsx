import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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
    await userEvent.clear(screen.getByRole("spinbutton", { name: /house plant quantity/i }));
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);
  });
});
