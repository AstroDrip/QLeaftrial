import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSiteLanguage } from "../../app/providers";
import { adminApi, type AdminProduct, type CreateAdminProductFields } from "./admin-api";

const emptyForm: CreateAdminProductFields = {
  name: "", nameAr: "", slug: "", sku: "", description: "", descriptionAr: "", category: "Indoor", categoryAr: "داخلي", light: "Bright indirect", lightAr: "إضاءة ساطعة غير مباشرة",
  priceQar: 0, costPrice: 0, stock: 0, imageAltText: "",
};

function ProductRow({ product }: { product: AdminProduct }) {
  const { isArabic } = useSiteLanguage();
  const t = isArabic ? { stock: "المخزون", price: "السعر", invalid: "يجب أن يكون رقمًا صحيحًا غير سالب", stockFail: "فشل حفظ المخزون", priceFail: "فشل حفظ السعر", saving: "جارٍ الحفظ…", saved: "تم الحفظ", arFail: "فشل حفظ النص العربي", arName: "الاسم العربي", arCategory: "الفئة العربية", arLight: "الإضاءة العربية", arDescription: "الوصف العربي" } : { stock: "Stock", price: "Price", invalid: "must be a non-negative whole number", stockFail: "Stock save failed", priceFail: "Price save failed", saving: "Saving…", saved: "Saved", arFail: "Arabic copy save failed", arName: "Arabic name", arCategory: "Arabic category", arLight: "Arabic light", arDescription: "Arabic description" };
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
    onError: (_error, patch) => setFieldErrors((errors) => ({ ...errors, ...(patch.stock !== undefined ? { stock: t.stockFail } : {}), ...(patch.priceQar !== undefined ? { priceQar: t.priceFail } : {}) })),
  });
  const saveTranslation = useMutation({
    mutationFn: (patch: { nameAr?: string; descriptionAr?: string; categoryAr?: string; lightAr?: string }) => adminApi.updateProduct(product.id, patch),
    scope: { id: `admin-product-${product.id}` },
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminProduct[]>(["admin", "products"], (items) => items?.map((item) => item.id === updated.id ? updated : item));
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["product"] });
      void queryClient.invalidateQueries({ queryKey: ["catalog-filters"] });
    },
  });
  function persist(field: "stock" | "priceQar", rawValue: string) {
    const activeTimer = timers.current[field];
    if (activeTimer) clearTimeout(activeTimer);
    delete timers.current[field];
    const label = field === "stock" ? t.stock : t.price;
    if (rawValue.trim() === "") {
      setFieldErrors((errors) => ({ ...errors, [field]: `${label} ${t.invalid}` }));
      return;
    }
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 0) {
      setFieldErrors((errors) => ({ ...errors, [field]: `${label} ${t.invalid}` }));
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
  return <tr><td>{product.name}</td><td><input type="text" dir="rtl" defaultValue={product.nameAr ?? ""} aria-label={`${product.name} ${t.arName}`} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value !== (product.nameAr ?? "")) saveTranslation.mutate({ nameAr: value }); }} /></td><td><input type="text" dir="rtl" defaultValue={product.categoryAr ?? ""} aria-label={`${product.name} ${t.arCategory}`} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value !== (product.categoryAr ?? "")) saveTranslation.mutate({ categoryAr: value }); }} /></td><td><input type="text" dir="rtl" defaultValue={product.lightAr ?? ""} aria-label={`${product.name} ${t.arLight}`} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value !== (product.lightAr ?? "")) saveTranslation.mutate({ lightAr: value }); }} /></td><td><textarea dir="rtl" defaultValue={product.descriptionAr ?? ""} aria-label={`${product.name} ${t.arDescription}`} onBlur={(event) => { const value = event.currentTarget.value.trim(); if (value !== (product.descriptionAr ?? "")) saveTranslation.mutate({ descriptionAr: value }); }} /></td><td><input type="number" min="0" step="1" aria-label={`${product.name} ${t.stock}`} aria-invalid={Boolean(fieldErrors.stock)} value={stock} onChange={(event) => { const value=event.target.value; setStock(value); schedule("stock",value); }} onBlur={() => persist("stock",stock)} /></td><td><input type="number" min="0" step="1" aria-label={`${product.name} ${t.price}`} aria-invalid={Boolean(fieldErrors.priceQar)} value={price} onChange={(event) => { const value=event.target.value; setPrice(value); schedule("priceQar",value); }} onBlur={() => persist("priceQar",price)} /></td><td aria-live="polite">{errorMessage ? <span role="alert">{errorMessage}</span> : save.isPending || saveTranslation.isPending ? t.saving : save.isSuccess || saveTranslation.isSuccess ? t.saved : saveTranslation.isError ? t.arFail : ""}</td></tr>;
}

export function AdminProductsPage() {
  const { content, isArabic } = useSiteLanguage();
  const t = isArabic ? { add: "إضافة نبات", name: "الاسم", arabicName: "الاسم العربي", slug: "الرابط المختصر", sku: "رمز المنتج", category: "الفئة", arabicCategory: "الفئة العربية", light: "الإضاءة", arabicLight: "الإضاءة العربية", price: "السعر (ر.ق)", cost: "التكلفة (ر.ق)", stock: "المخزون", description: "الوصف", arabicDescription: "الوصف العربي", alt: "النص البديل للصورة", image: "صورة النبات (مطلوبة)", preview: "معاينة النبات المحدد", adding: "جارٍ الإضافة…", product: "المنتج", status: "الحالة", loading: "جارٍ تحميل المنتجات…", loadError: "تعذر تحميل المنتجات.", imageRequired: "صورة النبات مطلوبة.", addError: "تعذر إضافة النبات", prodImageError: "اختر صورة JPEG أو PNG أو WebP أصغر من 20 ميجابايت.", devImageError: "اختر صورة PNG أو JPEG أو WebP أو GIF أصغر من 2 ميجابايت." } : { add: "Add plant", name: "Name", arabicName: "Arabic name", slug: "Slug", sku: "SKU", category: "Category", arabicCategory: "Arabic category", light: "Light", arabicLight: "Arabic light", price: "Price (QAR)", cost: "Cost (QAR)", stock: "Stock", description: "Description", arabicDescription: "Arabic description", alt: "Image alt text", image: "Plant image (required)", preview: "Selected plant preview", adding: "Adding…", product: "Product", status: "Status", loading: "Loading products…", loadError: "Could not load products.", imageRequired: "A plant image is required.", addError: "Could not add plant", prodImageError: "Choose a JPEG, PNG, or WebP image smaller than 20 MB.", devImageError: "Choose a PNG, JPEG, WebP, or GIF image smaller than 2 MB." };
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: adminApi.products });
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const create = useMutation({
    mutationFn: ({ input, file }: { input: CreateAdminProductFields; file: File }) =>
      adminApi.createProductWithImage(input, file),
    onSuccess: (created) => {
      queryClient.setQueryData<AdminProduct[]>(["admin", "products"], (items) => [...(items ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      setForm(emptyForm);
      setImageFile(null);
      setImagePreview("");
      if (imageInput.current) imageInput.current.value = "";
      setFormError("");
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : t.addError),
  });

  function updateField(field: keyof typeof form, value: string | number) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function readImage(file: File) {
    const acceptedTypes = import.meta.env.PROD
      ? ["image/png", "image/jpeg", "image/webp"]
      : ["image/png", "image/jpeg", "image/webp", "image/gif"];
    const maximumBytes = import.meta.env.PROD ? 20 * 1024 * 1024 : 2 * 1024 * 1024;
    if (!acceptedTypes.includes(file.type) || file.size > maximumBytes) {
      setImageFile(null);
      setImagePreview("");
      setFormError(import.meta.env.PROD ? t.prodImageError : t.devImageError);
      return;
    }
    setImageFile(file);
    setFormError("");
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") setImagePreview(reader.result);
    });
    reader.readAsDataURL(file);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    if (!imageFile) {
      setFormError(t.imageRequired);
      return;
    }
    create.mutate({
      file: imageFile,
      input: {
        ...form,
        priceQar: Number(form.priceQar),
        costPrice: Number(form.costPrice),
        stock: Number(form.stock),
      },
    });
  }
  return (
    <section className="page-shell admin-page" data-testid="admin-products-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.products}</p>
        <h1>{content.admin.products}</h1>
      </div>

      <form className="admin-product-form" onSubmit={submit}>
        <h2>{t.add}</h2>
        <div className="admin-product-form__grid">
          <label>{t.name}<input required value={form.name} onChange={(event) => updateField("name", event.target.value)} /></label>
          <label>{t.arabicName}<input dir="rtl" required value={form.nameAr} onChange={(event) => updateField("nameAr", event.target.value)} /></label>
          <label>{t.slug}<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(event) => updateField("slug", event.target.value)} /></label>
          <label>{t.sku}<input required value={form.sku} onChange={(event) => updateField("sku", event.target.value)} /></label>
          <label>{t.category}<input required value={form.category} onChange={(event) => updateField("category", event.target.value)} /></label>
          <label>{t.arabicCategory}<input dir="rtl" required value={form.categoryAr} onChange={(event) => updateField("categoryAr", event.target.value)} /></label>
          <label>{t.light}<input required value={form.light} onChange={(event) => updateField("light", event.target.value)} /></label>
          <label>{t.arabicLight}<input dir="rtl" required value={form.lightAr} onChange={(event) => updateField("lightAr", event.target.value)} /></label>
          <label>{t.price}<input required type="number" min="0" step="1" value={form.priceQar} onChange={(event) => updateField("priceQar", Number(event.target.value))} /></label>
          <label>{t.cost}<input required type="number" min="0" step="1" value={form.costPrice} onChange={(event) => updateField("costPrice", Number(event.target.value))} /></label>
          <label>{t.stock}<input required type="number" min="0" step="1" value={form.stock} onChange={(event) => updateField("stock", Number(event.target.value))} /></label>
          <label className="admin-product-form__full">{t.description}<textarea required minLength={10} value={form.description} onChange={(event) => updateField("description", event.target.value)} /></label>
          <label className="admin-product-form__full">{t.arabicDescription}<textarea dir="rtl" required minLength={10} value={form.descriptionAr} onChange={(event) => updateField("descriptionAr", event.target.value)} /></label>
          <label>{t.alt}<input required value={form.imageAltText} onChange={(event) => updateField("imageAltText", event.target.value)} /></label>
          <label>{t.image}<input ref={imageInput} required type="file" accept={import.meta.env.PROD ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,image/gif"} onChange={(event) => { const file = event.target.files?.[0]; if (file) readImage(file); }} /></label>
        </div>
        {imagePreview ? <img className="admin-product-form__preview" src={imagePreview} alt={t.preview} /> : null}
        {formError ? <p role="alert">{formError}</p> : null}
        <button className="primary-button" type="submit" disabled={create.isPending}>{create.isPending ? t.adding : t.add}</button>
      </form>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>{t.product}</th>
              <th>{t.arabicName}</th>
              <th>{t.arabicCategory}</th>
              <th>{t.arabicLight}</th>
              <th>{t.arabicDescription}</th>
              <th>{content.admin.stock}</th>
              <th>{content.admin.price}</th>
              <th>{t.status}</th>
            </tr>
          </thead>
          <tbody>
            {products.data?.map((product) => <ProductRow key={product.id} product={product} />)}
          </tbody>
        </table>
        {products.isPending ? <p>{t.loading}</p> : null}
        {products.isError ? <p role="alert">{t.loadError}</p> : null}
      </div>
    </section>
  );
}
