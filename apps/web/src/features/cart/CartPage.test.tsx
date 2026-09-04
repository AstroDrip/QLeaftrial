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
    expect(screen.getAllByText("360 QAR")).toHaveLength(2);
  });

  it("does not remove an item while its quantity field is temporarily empty", async () => {
    render(<MemoryRouter><CartPage /></MemoryRouter>);
    await userEvent.clear(screen.getByRole("spinbutton", { name: /house plant quantity/i }));
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);
  });
});
