import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { content } from "../../content/en";
import { adminApi, type AdminProduct, type CreateAdminProductInput } from "./admin-api";

const emptyForm: Omit<CreateAdminProductInput, "imageDataUrl"> & { imageDataUrl: string } = {
  name: "", slug: "", sku: "", description: "", category: "Indoor", light: "Bright indirect",
  priceQar: 0, costPrice: 0, stock: 0, imageDataUrl: "", imageAltText: "",
};

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
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const create = useMutation({
    mutationFn: adminApi.createProduct,
    onSuccess: (created) => {
      queryClient.setQueryData<AdminProduct[]>(["admin", "products"], (items) => [...(items ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      setForm(emptyForm);
      setFormError("");
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : "Could not add plant"),
  });

  function updateField(field: keyof typeof form, value: string | number) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function readImage(file: File) {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setFormError("Choose a PNG, JPEG, WebP, or GIF image smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") updateField("imageDataUrl", reader.result);
    });
    reader.readAsDataURL(file);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (!form.imageDataUrl) {
      setFormError("A plant image is required.");
      return;
    }
    create.mutate({
      ...form,
      priceQar: Number(form.priceQar),
      costPrice: Number(form.costPrice),
      stock: Number(form.stock),
    });
  }
  return (
    <section className="page-shell admin-page" data-testid="admin-products-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.products}</p>
        <h1>{content.admin.products}</h1>
      </div>

      <form className="admin-product-form" onSubmit={submit}>
        <h2>Add plant</h2>
        <div className="admin-product-form__grid">
          <label>Name<input required value={form.name} onChange={(event) => updateField("name", event.target.value)} /></label>
          <label>Slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(event) => updateField("slug", event.target.value)} /></label>
          <label>SKU<input required value={form.sku} onChange={(event) => updateField("sku", event.target.value)} /></label>
          <label>Category<input required value={form.category} onChange={(event) => updateField("category", event.target.value)} /></label>
          <label>Light<input required value={form.light} onChange={(event) => updateField("light", event.target.value)} /></label>
          <label>Price (QAR)<input required type="number" min="0" step="1" value={form.priceQar} onChange={(event) => updateField("priceQar", Number(event.target.value))} /></label>
          <label>Cost (QAR)<input required type="number" min="0" step="1" value={form.costPrice} onChange={(event) => updateField("costPrice", Number(event.target.value))} /></label>
          <label>Stock<input required type="number" min="0" step="1" value={form.stock} onChange={(event) => updateField("stock", Number(event.target.value))} /></label>
          <label className="admin-product-form__full">Description<textarea required minLength={10} value={form.description} onChange={(event) => updateField("description", event.target.value)} /></label>
          <label>Image alt text<input required value={form.imageAltText} onChange={(event) => updateField("imageAltText", event.target.value)} /></label>
          <label>Plant image (required)<input required type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) readImage(file); }} /></label>
        </div>
        {form.imageDataUrl ? <img className="admin-product-form__preview" src={form.imageDataUrl} alt="Selected plant preview" /> : null}
        {formError ? <p role="alert">{formError}</p> : null}
        <button className="primary-button" type="submit" disabled={create.isPending}>{create.isPending ? "Adding…" : "Add plant"}</button>
      </form>

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
