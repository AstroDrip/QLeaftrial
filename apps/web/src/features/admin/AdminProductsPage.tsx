import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { content } from "../../content/en";
import { adminApi, type AdminProduct } from "./admin-api";

function ProductRow({ product }: { product: AdminProduct }) {
  const queryClient = useQueryClient();
  const [stock, setStock] = useState(String(product.stock));
  const [price, setPrice] = useState(String(product.priceQar));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"stock" | "priceQar", string>>>({});
  const timers = useRef<Partial<Record<"stock" | "priceQar", ReturnType<typeof setTimeout>>>>({});
  const save = useMutation({
    mutationFn: (patch: { stock?: number; priceQar?: number }) => adminApi.updateProduct(product.id, patch),
    scope: { id: `admin-product-${product.id}` },
    onSuccess: (updated, patch) => {
      if (patch.stock !== undefined) setStock(String(updated.stock));
      if (patch.priceQar !== undefined) setPrice(String(updated.priceQar));
      setFieldErrors((errors) => ({ ...errors, ...(patch.stock !== undefined ? { stock: undefined } : {}), ...(patch.priceQar !== undefined ? { priceQar: undefined } : {}) }));
      queryClient.setQueryData<AdminProduct[]>(["admin", "products"], (items) => items?.map((item) => item.id === updated.id ? updated : item));
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["product"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog-filters"] });
    },
    onError: (_error, patch) => setFieldErrors((errors) => ({ ...errors, ...(patch.stock !== undefined ? { stock: "Stock save failed" } : {}), ...(patch.priceQar !== undefined ? { priceQar: "Price save failed" } : {}) })),
  });
  function persist(field: "stock" | "priceQar", rawValue: string) {
    const activeTimer = timers.current[field];
    if (activeTimer) clearTimeout(activeTimer);
    delete timers.current[field];
    const label = field === "stock" ? "Stock" : "Price";
    if (rawValue.trim() === "") {
      setFieldErrors((errors) => ({ ...errors, [field]: `${label} must be a non-negative whole number` }));
      return;
    }
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0) {
      setFieldErrors((errors) => ({ ...errors, [field]: `${label} must be a non-negative whole number` }));
      return;
    }
    setFieldErrors((errors) => ({ ...errors, [field]: undefined }));
    save.mutate({ [field]: value });
  }
  function schedule(field: "stock" | "priceQar", rawValue: string) {
    const activeTimer = timers.current[field];
    if (activeTimer) clearTimeout(activeTimer);
    timers.current[field] = setTimeout(() => persist(field, rawValue), 350);
  }
  useEffect(() => () => { Object.values(timers.current).forEach((timer) => clearTimeout(timer)); }, []);
  const errorMessage = [fieldErrors.stock, fieldErrors.priceQar].filter(Boolean).join(". ");
  return <tr><td>{product.name}</td><td><input type="number" min="0" step="1" aria-label={`${product.name} stock`} aria-invalid={Boolean(fieldErrors.stock)} value={stock} onChange={(event) => { const value=event.target.value; setStock(value); schedule("stock",value); }} onBlur={() => persist("stock",stock)} /></td><td><input type="number" min="0" step="1" aria-label={`${product.name} price`} aria-invalid={Boolean(fieldErrors.priceQar)} value={price} onChange={(event) => { const value=event.target.value; setPrice(value); schedule("priceQar",value); }} onBlur={() => persist("priceQar",price)} /></td><td aria-live="polite">{errorMessage ? <span role="alert">{errorMessage}</span> : save.isPending ? "Saving…" : save.isSuccess ? "Saved" : ""}</td></tr>;
}

export function AdminProductsPage() {
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: adminApi.products });
  return (
    <section className="page-shell admin-page" data-testid="admin-products-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.products}</p>
        <h1>{content.admin.products}</h1>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>{content.admin.stock}</th>
              <th>{content.admin.price}</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.data?.map((product) => <ProductRow key={product.id} product={product} />)}
          </tbody>
        </table>
        {products.isPending ? <p>Loading products…</p> : null}
        {products.isError ? <p role="alert">Could not load products.</p> : null}
      </div>
    </section>
  );
}
