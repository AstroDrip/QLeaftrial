import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { localeContent, type SiteLanguage } from "../../content/locales";
import { FallbackImage } from "../../components/FallbackImage";
import { useSiteLanguage } from "../../app/providers";
import { adminApi, type AdminProduct, type CreateAdminProductFields } from "./admin-api";
import "../catalog/catalog.css";
import "../cart/AddToCartButton.css";

const emptyForm: CreateAdminProductFields = {
  name: "", nameAr: "", slug: "", sku: "", description: "", descriptionAr: "", category: "Indoor", categoryAr: "داخلي", light: "Bright indirect", lightAr: "إضاءة ساطعة غير مباشرة",
  priceQar: 0, costPrice: 0, stock: 0, imageAltText: "",
};

function ProductRow({ product, cardLanguage }: { product: AdminProduct; cardLanguage: SiteLanguage }) {
  const { isArabic: adminIsArabic } = useSiteLanguage();
  const t = adminIsArabic
    ? { stock: "المخزون", price: "السعر", invalid: "يجب أن يكون رقمًا صحيحًا غير سالب", stockFail: "فشل حفظ المخزون", priceFail: "فشل حفظ السعر", saving: "جارٍ الحفظ…", saved: "تم الحفظ", arFail: "فشل حفظ النص العربي" }
    : { stock: "Stock", price: "Price", invalid: "must be a non-negative whole number", stockFail: "Stock save failed", priceFail: "Price save failed", saving: "Saving…", saved: "Saved", arFail: "Arabic copy save failed" };
  const queryClient = useQueryClient();
  const [stock, setStock] = useState(String(product.stock));
  const [price, setPrice] = useState(String(product.priceQar));
  const [nameAr, setNameAr] = useState(product.nameAr ?? "");
  const [categoryAr, setCategoryAr] = useState(product.categoryAr ?? "");
  const [lightAr, setLightAr] = useState(product.lightAr ?? "");
  const [descriptionAr, setDescriptionAr] = useState(product.descriptionAr ?? "");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"stock" | "priceQar", string>>>({});
  const timers = useRef<Partial<Record<"stock" | "priceQar", ReturnType<typeof setTimeout>>>>({});

  const save = useMutation({
    mutationFn: (patch: { stock?: number; priceQar?: number; published?: boolean; nameAr?: string; descriptionAr?: string; categoryAr?: string; lightAr?: string }) =>
      adminApi.updateProduct(product.id, patch),
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
    onError: () => undefined,
  });

  const remove = useMutation({
    mutationFn: () => adminApi.deleteProduct(product.id),
    onSuccess: () => {
      queryClient.setQueryData<AdminProduct[]>(["admin", "products"], (items) => items?.filter((item) => item.id !== product.id));
      void queryClient.invalidateQueries({ queryKey: ["products"] });
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
  function saveArabic() {
    const patch = {
      ...(nameAr.trim() ? { nameAr: nameAr.trim() } : {}),
      ...(descriptionAr.trim() ? { descriptionAr: descriptionAr.trim() } : {}),
      ...(categoryAr.trim() ? { categoryAr: categoryAr.trim() } : {}),
      ...(lightAr.trim() ? { lightAr: lightAr.trim() } : {}),
    };
    if (Object.keys(patch).length > 0) saveTranslation.mutate(patch);
  }

  function handleDelete() {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    remove.mutate();
  }

  const isArabic = cardLanguage === "ar";
  const customerContent = localeContent[cardLanguage];
  const inStock = product.stock > 0;

  const shownName        = isArabic ? (nameAr || product.nameAr || product.name) : product.name;
  const shownCategory    = isArabic ? (categoryAr || product.categoryAr || product.category) : product.category;
  const shownLight       = isArabic ? (lightAr || product.lightAr || product.light) : product.light;
  const shownDescription = isArabic ? (descriptionAr || product.descriptionAr || product.description) : product.description;

  const isPublished = product.published ?? true;

  return (
    <tr>
      <td>
        <article className="product-card admin-product-language-preview" dir={isArabic ? "rtl" : "ltr"} lang={cardLanguage}>
          <FallbackImage
            className="product-card__image"
            src={product.image?.url ?? "/images/hero/leaf-1.svg"}
            alt={product.image?.altText ?? ""}
          />
          <h2 className="product-card__name">{shownName}</h2>
          <p className="product-card__price">{product.priceQar} QAR</p>
          <p className="admin-product-preview__meta">
            <span>{customerContent.product.category}: {shownCategory}</span>
            {" · "}
            <span>{customerContent.product.lightNeeds}: {shownLight}</span>
          </p>
          <p className="admin-product-preview__desc">{shownDescription}</p>
          <span className="product-card__link">{customerContent.catalog.viewProduct(shownName)}</span>
          <div className="add-to-cart__controls">
            <span className={`add-to-cart product-card__cart${inStock ? "" : " admin-product-language-preview__cart--out"}`}>
              <svg
                className="add-to-cart__icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 8h10l1 11H6L7 8Z" />
                <path d="M9 9V6a3 3 0 0 1 6 0v3" />
              </svg>
              <span className="add-to-cart__label">
                {inStock ? customerContent.product.addToCart : customerContent.product.outOfStock}
              </span>
            </span>
          </div>
        </article>

        {isArabic ? (
          <div className="admin-product-ar-fields" dir="rtl" lang="ar">
            <input aria-label={`${product.name} Arabic name`} placeholder="الاسم بالعربية" value={nameAr} onChange={(event) => setNameAr(event.target.value)} onBlur={() => { if (nameAr.trim() && nameAr.trim() !== product.nameAr) saveTranslation.mutate({ nameAr: nameAr.trim() }); }} />
            <input aria-label={`${product.name} Arabic category`} placeholder="الفئة بالعربية" value={categoryAr} onChange={(event) => setCategoryAr(event.target.value)} onBlur={() => { if (categoryAr.trim() && categoryAr.trim() !== product.categoryAr) saveTranslation.mutate({ categoryAr: categoryAr.trim() }); }} />
            <input aria-label={`${product.name} Arabic light`} placeholder="الإضاءة بالعربية" value={lightAr} onChange={(event) => setLightAr(event.target.value)} onBlur={() => { if (lightAr.trim() && lightAr.trim() !== product.lightAr) saveTranslation.mutate({ lightAr: lightAr.trim() }); }} />
            <textarea aria-label={`${product.name} Arabic description`} placeholder="الوصف بالعربية" value={descriptionAr} onChange={(event) => setDescriptionAr(event.target.value)} onBlur={() => { if (descriptionAr.trim() && descriptionAr.trim() !== product.descriptionAr) saveTranslation.mutate({ descriptionAr: descriptionAr.trim() }); }} />
            <button type="button" className="primary-button primary-button--secondary" onClick={saveArabic}>Save Arabic</button>
          </div>
        ) : null}
      </td>

      <td><input type="number" min="0" step="1" aria-label={`${product.name} stock`} aria-invalid={Boolean(fieldErrors.stock)} value={stock} onChange={(event) => { const value=event.target.value; setStock(value); schedule("stock",value); }} onBlur={() => persist("stock",stock)} /></td>
      <td><input type="number" min="0" step="1" aria-label={`${product.name} price`} aria-invalid={Boolean(fieldErrors.priceQar)} value={price} onChange={(event) => { const value=event.target.value; setPrice(value); schedule("priceQar",value); }} onBlur={() => persist("priceQar",price)} /></td>

      <td>
        <div className="admin-product-row-actions">
          <span className={`admin-product-status-pill admin-product-status-pill--${isPublished ? "published" : "draft"}`}>
            {isPublished ? "Published" : "Draft"}
          </span>
          <button
            type="button"
            className="primary-button primary-button--secondary admin-product-publish-btn"
            disabled={save.isPending}
            onClick={() => save.mutate({ published: !isPublished })}
          >
            {isPublished ? "Unpublish" : "Publish"}
          </button>
          <button
            type="button"
            className="primary-button admin-product-delete-btn"
            disabled={remove.isPending}
            onClick={handleDelete}
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
        <div aria-live="polite" className="admin-product-save-status">
          {errorMessage ? <span role="alert">{errorMessage}</span> : saveTranslation.isError ? <span role="alert">{t.arFail}</span> : save.isPending || saveTranslation.isPending ? t.saving : save.isSuccess || saveTranslation.isSuccess ? t.saved : ""}
        </div>
        {remove.isError ? <span role="alert" className="admin-product-delete-error">Delete failed</span> : null}
      </td>
    </tr>
  );
}

export function AdminProductsPage() {
  const { content, isArabic } = useSiteLanguage();
  const t = isArabic ? { add: "إضافة نبات", name: "الاسم", arabicName: "الاسم العربي", slug: "الرابط المختصر", sku: "رمز المنتج", category: "الفئة", arabicCategory: "الفئة العربية", light: "الإضاءة", arabicLight: "الإضاءة العربية", price: "السعر (ر.ق)", cost: "التكلفة (ر.ق)", stock: "المخزون", description: "الوصف", arabicDescription: "الوصف العربي", alt: "النص البديل للصورة", image: "صورة النبات (مطلوبة)", preview: "معاينة النبات المحدد", adding: "جارٍ الإضافة…", product: "المنتج", status: "الحالة", loading: "جارٍ تحميل المنتجات…", loadError: "تعذر تحميل المنتجات.", imageRequired: "صورة النبات مطلوبة.", addError: "تعذر إضافة النبات", prodImageError: "اختر صورة JPEG أو PNG أو WebP أصغر من 20 ميجابايت.", devImageError: "اختر صورة PNG أو JPEG أو WebP أو GIF أصغر من 2 ميجابايت." } : { add: "Add plant", name: "Name", arabicName: "Arabic name", slug: "Slug", sku: "SKU", category: "Category", arabicCategory: "Arabic category", light: "Light", arabicLight: "Arabic light", price: "Price (QAR)", cost: "Cost (QAR)", stock: "Stock", description: "Description", arabicDescription: "Arabic description", alt: "Image alt text", image: "Plant image (required)", preview: "Selected plant preview", adding: "Adding…", product: "Product", status: "Status", loading: "Loading products…", loadError: "Could not load products.", imageRequired: "A plant image is required.", addError: "Could not add plant", prodImageError: "Choose a JPEG, PNG, or WebP image smaller than 20 MB.", devImageError: "Choose a PNG, JPEG, WebP, or GIF image smaller than 2 MB." };
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: adminApi.products });
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [previewLanguage, setPreviewLanguage] = useState<SiteLanguage>("en");
  const [search, setSearch] = useState("");
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

  const filteredProducts = (products.data ?? []).filter((p) =>
    search.trim() === "" ||
    p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
    (p.nameAr ?? "").includes(search.trim())
  );

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
        <div className="admin-products-language-control">
          <span>Product card preview</span>
          <div className="admin-product-language-toggle" role="group" aria-label="Product card preview language">
            <button type="button" aria-pressed={previewLanguage === "en"} onClick={() => setPreviewLanguage("en")}>English</button>
            <button type="button" aria-pressed={previewLanguage === "ar"} onClick={() => setPreviewLanguage("ar")}>العربية</button>
          </div>
        </div>

        <div className="admin-products-search">
          <label htmlFor="admin-products-search-input" className="admin-products-search__label">Search products</label>
          <input
            id="admin-products-search-input"
            type="search"
            className="admin-products-search__input"
            placeholder="Filter by name…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <p className="admin-products-search__count" aria-live="polite">
              {filteredProducts.length} of {products.data?.length ?? 0} products
            </p>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th>{t.product}</th>
              <th>{t.stock}</th>
              <th>{t.price}</th>
              <th>{t.status}</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => <ProductRow key={product.id} product={product} cardLanguage={previewLanguage} />)}
          </tbody>
        </table>
        {filteredProducts.length === 0 && search && products.data && products.data.length > 0 ? (
          <p className="admin-products-search__empty">No products match "{search}".</p>
        ) : null}
        {products.isPending ? <p>{t.loading}</p> : null}
        {products.isError ? <p role="alert">{t.loadError}</p> : null}
      </div>
    </section>
  );
}
