import { beforeEach, describe, expect, it } from "vitest";
import { cartSubtotal, useCartStore } from "./cart-store";

const plant = {
  id: "plant-1",
  slug: "house-plant",
  name: "House Plant",
  priceQar: 180,
  stock: 3,
  image: { url: "/house.jpg", altText: "House plant" },
};

describe("cart store", () => {
  beforeEach(() => {
    localStorage.clear();
    useCartStore.setState({ items: [] });
  });

  it("adds products, merges duplicates, and clamps quantity to stock", () => {
    useCartStore.getState().addItem(plant);
    useCartStore.getState().addItem(plant);
    useCartStore.getState().addItem(plant);
    useCartStore.getState().addItem(plant);

    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({
        id: "plant-1",
        quantity: 3,
        stock: 3,
        priceQar: 180,
      }),
    ]);
    expect(cartSubtotal(useCartStore.getState().items)).toBe(540);
  });

  it("updates and removes items without allowing unavailable products", () => {
    useCartStore.getState().addItem({ ...plant, stock: 0 });
    expect(useCartStore.getState().items).toEqual([]);

    useCartStore.getState().addItem(plant);
    useCartStore.getState().setQuantity(plant.id, 2);
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);

    useCartStore.getState().setQuantity(plant.id, 0);
    expect(useCartStore.getState().items).toEqual([]);
  });

  it("persists only the cart item state", () => {
    useCartStore.getState().addItem(plant);

    expect(localStorage.getItem("qleaves-cart")).toContain('"house-plant"');
    expect(localStorage.getItem("qleaves-cart")).not.toContain("addItem");
  });
});
