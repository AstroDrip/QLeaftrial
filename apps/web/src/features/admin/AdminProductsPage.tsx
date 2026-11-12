import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { localeContent, type SiteLanguage } from "../../content/locales";
import { FallbackImage } from "../../components/FallbackImage";
import { ApiClientError } from "../../lib/api-error";
import { useSiteLanguage } from "../../app/providers";
import { adminApi, type AdminProduct, type AdminProductPatch, type CreateAdminProductFields } from "./admin-api";
import { friendlyError } from "../../lib/friendly-error";

const emptyForm: CreateAdminProductFields = {
  name: "", nameAr: "", slug: "", sku: "", description: "", descriptionAr: "", category: "Indoor", categoryAr: "داخلي", light: "", lightAr: "",
  priceQar: 0, costPrice: 0, stock: 0, imageAltText: "",
};

const PRODUCTION_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const DEVELOPMENT_IMAGE_TYPES = [...PRODUCTION_IMAGE_TYPES, "image/gif"];

// Production images are resized in the browser before upload, so larger originals are accepted.
function imageProblem(file: File, isArabic: boolean): string | null {
  const accepted = import.meta.env.PROD ? PRODUCTION_IMAGE_TYPES : DEVELOPMENT_IMAGE_TYPES;
  const maximumBytes = import.meta.env.PROD ? 20 * 1024 * 1024 : 2 * 1024 * 1024;
  if (accepted.includes(file.type) && file.size <= maximumBytes) return null;
  if (import.meta.env.PROD) return isArabic ? "اختر صورة JPEG أو PNG أو WebP أصغر من 20 ميجابايت." : "Choose a JPEG, PNG, or WebP image smaller than 20 MB.";
  return isArabic ? "اختر صورة PNG أو JPEG أو WebP أو GIF أصغر من 2 ميجابايت." : "Choose a PNG, JPEG, WebP, or GIF image smaller than 2 MB.";
}

function useProductCacheUpdate() {
  const queryClient = useQueryClient();
  return (updated: AdminProduct) => {
    queryClient.setQueryData<AdminProduct[]>(["admin", "products"], (items) => items?.map((item) => item.id === updated.id ? updated : item));
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["product"] });
    void queryClient.invalidateQueries({ queryKey: ["catalog-filters"] });
  };
}

// The photo itself is the control: clicking it opens the file picker.
function ProductPhoto({ product }: { product: AdminProduct }) {
  const { isArabic } = useSiteLanguage();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState("");
  const applyUpdate = useProductCacheUpdate();
  const replace = useMutation({
    mutationFn: (file: File) => adminApi.replaceProductImage(product.id, file, product.image?.altText || product.name),
    onSuccess: (updated) => { setProblem(""); applyUpdate(updated); },
    onError: (error) => setProblem(friendlyError(error, isArabic ? "ar" : "en")),
  });

  function choose(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    const issue = imageProblem(file, isArabic);
    if (issue) { setProblem(issue); return; }
    replace.mutate(file);
  }

  const hint = replace.isPending ? (isArabic ? "جارٍ الرفع…" : "Uploading…") : (isArabic ? "تغيير الصورة" : "Change photo");
  return (
    <div className="admin-product-photo">
      <input ref={input} type="file" hidden aria-label={`${product.name} new photo`} accept={(import.meta.env.PROD ? PRODUCTION_IMAGE_TYPES : DEVELOPMENT_IMAGE_TYPES).join(",")} onChange={(event) => choose(event.target.files?.[0])} />
      <button
        type="button"
        className={`admin-product-photo__button${replace.isPending ? " is-busy" : ""}`}
        aria-label={isArabic ? `تغيير صورة ${product.name}` : `Change photo for ${product.name}`}
        aria-busy={replace.isPending}
        disabled={replace.isPending}
        onClick={() => input.current?.click()}
      >
        <FallbackImage className="admin-product-card__image" src={product.image?.url ?? "/images/hero/leaf-1.svg"} alt="" />
        <span className="admin-product-photo__hint" aria-hidden="true">{hint}</span>
      </button>
      {problem ? <span role="alert" className="admin-product-photo__error">{problem}</span> : null}
    </div>
  );
}

type DetailsDraft = { name: string; category: string; light: string; description: string; costPrice: string };

function draftFor(product: AdminProduct, language: SiteLanguage): DetailsDraft {
  return language === "ar"
    ? { name: product.nameAr ?? "", category: product.categoryAr ?? "", light: product.lightAr ?? "", description: product.descriptionAr ?? "", costPrice: String(product.costPrice ?? "") }
    : { name: product.name, category: product.category, light: product.light ?? "", description: product.description, costPrice: String(product.costPrice ?? "") };
}

// Edits the language the card is currently showing: English fields (plus cost)
// or the Arabic copy shown on the Arabic storefront.
function ProductDetailsEditor({ product, language }: { product: AdminProduct; language: SiteLanguage }) {
  const { isArabic } = useSiteLanguage();
  const t = isArabic
    ? { title: language === "ar" ? "تعديل التفاصيل العربية" : "تعديل التفاصيل الإنجليزية", name: "الاسم", category: "الفئة", light: "الإضاءة (اتركها فارغة للإكسسوارات)", description: "الوصف", cost: "التكلفة (ر.ق)", save: "حفظ التفاصيل", saving: "جارٍ الحفظ…", saved: "تم حفظ التفاصيل", invalidCost: "يجب أن تكون التكلفة رقمًا صحيحًا غير سالب", nothing: "لا توجد تغييرات", failed: "تعذر حفظ التفاصيل" }
    : { title: language === "ar" ? "Edit Arabic details" : "Edit details", name: "Name", category: "Category", light: "Light (leave empty for accessories)", description: "Description", cost: "Cost (QAR)", save: "Save details", saving: "Saving…", saved: "Details saved", invalidCost: "Cost must be a non-negative whole number", nothing: "No changes to save", failed: "Could not save details" };
  const [draft, setDraft] = useState(() => draftFor(product, language));
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const applyUpdate = useProductCacheUpdate();
  const save = useMutation({
    mutationFn: (patch: AdminProductPatch) => adminApi.updateProduct(product.id, patch),
    scope: { id: `admin-product-${product.id}` },
    onSuccess: (updated) => { applyUpdate(updated); setMessage(t.saved); },
    onError: (error) => setMessage(friendlyError(error, isArabic ? "ar" : "en")),
  });

  useEffect(() => { setDraft(draftFor(product, language)); setMessage(""); }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  function englishPatch(): AdminProductPatch | string {
    const cost = Number(draft.costPrice);
    if (draft.costPrice.trim() === "" || !Number.isInteger(cost) || cost < 0) return t.invalidCost;
    const light = draft.light.trim() || null;
    return {
      ...(draft.name.trim() !== product.name ? { name: draft.name.trim() } : {}),
      ...(draft.category.trim() !== product.category ? { category: draft.category.trim() } : {}),
      ...(light !== (product.light ?? null) ? { light } : {}),
      ...(draft.description.trim() !== product.description ? { description: draft.description.trim() } : {}),
      ...(cost !== product.costPrice ? { costPrice: cost } : {}),
    };
  }

  // Arabic copy is optional; empty fields fall back to English on the storefront.
  function arabicPatch(): AdminProductPatch {
    const changed = (value: string, current: string | null | undefined) => value.trim() && value.trim() !== (current ?? "");
    return {
      ...(changed(draft.name, product.nameAr) ? { nameAr: draft.name.trim() } : {}),
      ...(changed(draft.category, product.categoryAr) ? { categoryAr: draft.category.trim() } : {}),
      ...(changed(draft.light, product.lightAr) ? { lightAr: draft.light.trim() } : {}),
      ...(changed(draft.description, product.descriptionAr) ? { descriptionAr: draft.description.trim() } : {}),
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch = language === "ar" ? arabicPatch() : englishPatch();
    if (typeof patch === "string") { setMessage(patch); return; }
    if (Object.keys(patch).length === 0) { setMessage(t.nothing); return; }
    setMessage("");
    save.mutate(patch);
  }

  const field = (key: keyof DetailsDraft) => ({
    value: draft[key],
    onChange: (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [key]: event.target.value })),
  });
  const arabic = language === "ar";
  const suffix = arabic ? "Arabic" : "English";

  return (
    <details className="admin-product-card__editor" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{t.title}</summary>
      {open ? (
        <form className="admin-product-details-form" onSubmit={submit} dir={arabic ? "rtl" : "ltr"} lang={language}>
          <label>{t.name}<input required={!arabic} minLength={2} maxLength={120} aria-label={`${product.name} ${suffix} name`} {...field("name")} /></label>
          <label>{t.category}<input required={!arabic} minLength={2} maxLength={80} aria-label={`${product.name} ${suffix} category`} {...field("category")} /></label>
          <label>{t.light}<input maxLength={80} aria-label={`${product.name} ${suffix} light`} {...field("light")} /></label>
          {arabic ? null : <label>{t.cost}<input type="number" min="0" step="1" aria-label={`${product.name} cost`} {...field("costPrice")} /></label>}
          <label className="admin-product-details-form__full">{t.description}<textarea required={!arabic} minLength={10} maxLength={2000} aria-label={`${product.name} ${suffix} description`} {...field("description")} /></label>
          <div className="admin-product-details-form__actions">
            <button type="submit" className="primary-button" disabled={save.isPending}>{save.isPending ? t.saving : t.save}</button>
            <span aria-live="polite" role={save.isError ? "alert" : undefined}>{message}</span>
          </div>
        </form>
      ) : null}
    </details>
  );
}

function ProductRow({ product }: { product: AdminProduct }) {
  const { isArabic: adminIsArabic, language: adminLanguage } = useSiteLanguage();
  const t = adminIsArabic
    ? { stock: "المخزون", price: "السعر (ر.ق)", invalid: "يجب أن يكون رقمًا صحيحًا غير سالب", stockFail: "فشل حفظ المخزون", priceFail: "فشل حفظ السعر", saving: "جارٍ الحفظ…", saved: "تم الحفظ", published: "منشور", draft: "غير منشور", publish: "انقر للنشر", unpublish: "انقر لإلغاء النشر", remove: "حذف", removing: "جارٍ الحذف…", removeFail: "فشل الحذف", hasOrders: "لا يمكن حذف هذا المنتج لأنه موجود في طلبات سابقة. ألغِ نشره بدلًا من ذلك.", cardLanguage: "لغة البطاقة", noArabic: "لا يوجد نص عربي بعد؛ يظهر النص الإنجليزي للعملاء.", confirmDelete: (name: string) => `حذف "${name}"؟ لا يمكن التراجع عن هذا الإجراء.` }
    : { stock: "Stock", price: "Price (QAR)", invalid: "must be a non-negative whole number", stockFail: "Stock save failed", priceFail: "Price save failed", saving: "Saving…", saved: "Saved", published: "Published", draft: "Unpublished", publish: "Click to publish", unpublish: "Click to unpublish", remove: "Delete", removing: "Deleting…", removeFail: "Delete failed", hasOrders: "This product appears in past orders, so it can't be deleted. Unpublish it instead.", cardLanguage: "Card language", noArabic: "No Arabic copy yet; customers see the English text.", confirmDelete: (name: string) => `Delete "${name}"? This cannot be undone.` };
  const queryClient = useQueryClient();
  const [cardLanguage, setCardLanguage] = useState<SiteLanguage>(adminLanguage);
  const [stock, setStock] = useState(String(product.stock));
  const [price, setPrice] = useState(String(product.priceQar));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"stock" | "priceQar", string>>>({});
  const timers = useRef<Partial<Record<"stock" | "priceQar", ReturnType<typeof setTimeout>>>>({});

  useEffect(() => { setCardLanguage(adminLanguage); }, [adminLanguage]);

  const save = useMutation({
    mutationFn: (patch: { stock?: number; priceQar?: number; published?: boolean }) => adminApi.updateProduct(product.id, patch),
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
    const label = field === "stock" ? t.stock : t.price.replace(/\s*\(.*\)$/, "");
    const value = Number(rawValue);
    if (rawValue.trim() === "" || !Number.isInteger(value) || value < 0) {
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

  function handleDelete() {
    if (!window.confirm(t.confirmDelete(product.name))) return;
    remove.mutate();
  }

  const isArabic = cardLanguage === "ar";
  const customerContent = localeContent[cardLanguage];
  const inStock = product.stock > 0;
  const missingArabic = isArabic && !product.nameAr?.trim();
  const shownName = isArabic ? product.nameAr?.trim() || product.name : product.name;
  const shownCategory = isArabic ? product.categoryAr?.trim() || product.category : product.category;
  const shownLight = isArabic ? product.lightAr?.trim() || product.light : product.light;
  const shownDescription = isArabic ? product.descriptionAr?.trim() || product.description : product.description;
  const isPublished = product.published ?? true;
  const errorMessage = [fieldErrors.stock, fieldErrors.priceQar].filter(Boolean).join(". ");
  const statusText = errorMessage
    ? <span role="alert">{errorMessage}</span>
    : save.isPending ? t.saving : save.isSuccess ? t.saved : "";

  return (
    <li className={`admin-product-card${isPublished ? "" : " is-draft"}`}>
      <ProductPhoto product={product} />

      <div className="admin-product-card__body">
        <div className="admin-product-card__top">
          <div className="segmented segmented--small" role="group" aria-label={`${product.name} ${t.cardLanguage}`}>
            <button type="button" aria-pressed={!isArabic} onClick={() => setCardLanguage("en")}>EN</button>
            <button type="button" aria-pressed={isArabic} onClick={() => setCardLanguage("ar")} lang="ar">عربي</button>
          </div>
          {/* The badge is the publish switch: Published ⇄ Unpublished. */}
          <button
            type="button"
            className={`admin-product-status-pill admin-product-status-pill--${isPublished ? "published" : "draft"}`}
            aria-pressed={isPublished}
            title={isPublished ? t.unpublish : t.publish}
            disabled={save.isPending}
            onClick={() => save.mutate({ published: !isPublished })}
          >
            {isPublished ? t.published : t.draft}
          </button>
        </div>

        <div className="admin-product-card__details" dir={isArabic ? "rtl" : "ltr"} lang={cardLanguage}>
          <h2 className="admin-product-card__name">{shownName}</h2>
          <p className="admin-product-card__meta">
            <span>{shownCategory}</span>
            {shownLight ? <span>{shownLight}</span> : null}
            <span className={`admin-product-card__stock admin-product-card__stock--${inStock ? "in" : "out"}`}>
              {inStock ? customerContent.product.inStock : customerContent.product.outOfStock}
            </span>
          </p>
          <p className="admin-product-card__desc">{shownDescription}</p>
          {missingArabic ? <p className="admin-product-card__hint">{t.noArabic}</p> : null}
        </div>

        <div className="admin-product-card__controls">
          <label className="admin-product-card__field">
            <span>{t.stock}</span>
            <input type="number" min="0" step="1" aria-label={`${product.name} stock`} aria-invalid={Boolean(fieldErrors.stock)} value={stock} onChange={(event) => { const value = event.target.value; setStock(value); schedule("stock", value); }} onBlur={() => persist("stock", stock)} />
          </label>
          <label className="admin-product-card__field">
            <span>{t.price}</span>
            <input type="number" min="0" step="1" aria-label={`${product.name} price`} aria-invalid={Boolean(fieldErrors.priceQar)} value={price} onChange={(event) => { const value = event.target.value; setPrice(value); schedule("priceQar", value); }} onBlur={() => persist("priceQar", price)} />
          </label>
        </div>

        <div aria-live="polite" className="admin-product-save-status">{statusText}</div>
        {remove.isError ? <p role="alert" className="admin-product-delete-error">{remove.error instanceof ApiClientError && remove.error.code === "PRODUCT_HAS_ORDERS" ? t.hasOrders : t.removeFail}</p> : null}

        <div className="admin-product-card__footer">
          <ProductDetailsEditor product={product} language={cardLanguage} />
          <button type="button" className="admin-product-card__delete" disabled={remove.isPending} onClick={handleDelete}>
            {remove.isPending ? t.removing : t.remove}
          </button>
        </div>
      </div>
    </li>
  );
}

export function AdminProductsPage() {
  const { content, isArabic } = useSiteLanguage();
  const t = isArabic ? { add: "إضافة نبات", name: "الاسم", arabicName: "الاسم العربي", slug: "الرابط المختصر", sku: "رمز المنتج", category: "الفئة", arabicCategory: "الفئة العربية", light: "الإضاءة (اختياري، اتركها فارغة للأحواض والتربة والإكسسوارات)", arabicLight: "الإضاءة بالعربية (اختياري)", price: "السعر (ر.ق)", cost: "التكلفة (ر.ق)", stock: "المخزون", description: "الوصف", arabicDescription: "الوصف العربي", alt: "النص البديل للصورة", image: "صورة النبات (مطلوبة)", preview: "معاينة النبات المحدد", adding: "جارٍ الإضافة…", product: "المنتج", status: "الحالة", loading: "جارٍ تحميل المنتجات…", loadError: "تعذر تحميل المنتجات.", imageRequired: "صورة النبات مطلوبة.", addError: "تعذر إضافة النبات", newPlant: "نبات جديد", close: "إغلاق النموذج" } : { add: "Add plant", name: "Name", arabicName: "Arabic name", slug: "Slug", sku: "SKU", category: "Category", arabicCategory: "Arabic category", light: "Light (optional, leave empty for pots, soil and accessories)", arabicLight: "Arabic light (optional)", price: "Price (QAR)", cost: "Cost (QAR)", stock: "Stock", description: "Description", arabicDescription: "Arabic description", alt: "Image alt text", image: "Plant image (required)", preview: "Selected plant preview", adding: "Adding…", product: "Product", status: "Status", loading: "Loading products…", loadError: "Could not load products.", imageRequired: "A plant image is required.", addError: "Could not add plant", newPlant: "New plant", close: "Close form" };
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: adminApi.products });
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
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
    onError: (error) => setFormError(friendlyError(error, isArabic ? "ar" : "en")),
  });

  function updateField(field: keyof typeof form, value: string | number) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function readImage(file: File) {
    const issue = imageProblem(file, isArabic);
    if (issue) {
      setImageFile(null);
      setImagePreview("");
      setFormError(issue);
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
        light: form.light?.trim() || undefined,
        lightAr: form.lightAr?.trim() || undefined,
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

      <section className="admin-product-form-card">
        <button type="button" className="primary-button admin-product-form-card__toggle" aria-expanded={formOpen} aria-controls="admin-new-plant" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? t.close : `+ ${t.newPlant}`}
        </button>
        {formOpen ? (
      <form id="admin-new-plant" className="admin-product-form" onSubmit={submit}>
        <h2>{t.add}</h2>
        <div className="admin-product-form__grid">
          <label>{t.name}<input required value={form.name} onChange={(event) => updateField("name", event.target.value)} /></label>
          <label>{t.arabicName}<input dir="rtl" required value={form.nameAr} onChange={(event) => updateField("nameAr", event.target.value)} /></label>
          <label>{t.slug}<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={form.slug} onChange={(event) => updateField("slug", event.target.value)} /></label>
          <label>{t.sku}<input required value={form.sku} onChange={(event) => updateField("sku", event.target.value)} /></label>
          <label>{t.category}<input required value={form.category} onChange={(event) => updateField("category", event.target.value)} /></label>
          <label>{t.arabicCategory}<input dir="rtl" required value={form.categoryAr} onChange={(event) => updateField("categoryAr", event.target.value)} /></label>
          <label>{t.light}<input value={form.light} onChange={(event) => updateField("light", event.target.value)} /></label>
          <label>{t.arabicLight}<input dir="rtl" value={form.lightAr} onChange={(event) => updateField("lightAr", event.target.value)} /></label>
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
        ) : null}
      </section>

      <div className="table-card admin-products-panel">
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

        <ul className="admin-product-list">
          {filteredProducts.map((product) => <ProductRow key={product.id} product={product} />)}
        </ul>
        {filteredProducts.length === 0 && search && products.data && products.data.length > 0 ? (
          <p className="admin-products-search__empty">No products match "{search}".</p>
        ) : null}
        {products.isPending ? <p>{t.loading}</p> : null}
        {products.isError ? <p role="alert">{t.loadError}</p> : null}
      </div>
    </section>
  );
}
