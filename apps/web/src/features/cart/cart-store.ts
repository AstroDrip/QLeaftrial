import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProductMedia } from "../catalog/product-types";

export type CartProduct = {
  id: string;
  slug: string;
  name: string;
  priceQar: number;
  stock: number;
  image: ProductMedia | null;
};

export type CartItem = CartProduct & {
  quantity: number;
};

type CartState = {
  items: CartItem[];
  addItem: (product: CartProduct) => void;
  setQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
};

function clampQuantity(quantity: number, stock: number): number {
  return Math.max(0, Math.min(Math.trunc(quantity), stock));
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (product) => {
        if (product.stock <= 0) return;
        set((state) => {
          const existing = state.items.find((item) => item.id === product.id);
          if (!existing) {
            return { items: [...state.items, { ...product, quantity: 1 }] };
          }
          return {
            items: state.items.map((item) =>
              item.id === product.id
                ? {
                    ...item,
                    ...product,
                    quantity: clampQuantity(item.quantity + 1, product.stock),
                  }
                : item,
            ),
          };
        });
      },
      setQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items
            .map((item) =>
              item.id === id
                ? { ...item, quantity: clampQuantity(quantity, item.stock) }
                : item,
            )
            .filter((item) => item.quantity > 0),
        })),
      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: "qleaves-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
);

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce(
    (total, item) => total + item.priceQar * item.quantity,
    0,
  );
}
