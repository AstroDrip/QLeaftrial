import "../reviews/reviews.css";
import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSiteLanguage } from "../../app/providers";
import { FallbackImage } from "../../components/FallbackImage";
import { LeafIcon } from "../../components/icons";
import { ReviewSheet } from "../reviews/ReviewSheet";
import { adminApi, type AdminReview, type ReviewInput } from "./admin-api";
import { REVIEW_PHOTO_MAX_BYTES, REVIEW_PHOTO_TYPES, reviewPhotoDataUrl } from "./review-photo";
import { friendlyError } from "../../lib/friendly-error";

type Draft = {
  customerName: string;
  body: string;
  rating: number;
  productId: string;
  reviewedAt: string;
  location: string;
  label: string;
  published: boolean;
  photo: string | null;
  photoChanged: boolean;
};

const emptyDraft: Draft = { customerName: "", body: "", rating: 5, productId: "", reviewedAt: "", location: "", label: "", published: false, photo: null, photoChanged: false };

function draftFrom(review: AdminReview): Draft {
  return {
    customerName: review.customerName,
    body: review.body,
    rating: review.rating,
    productId: review.productId ?? "",
    reviewedAt: review.reviewedAt ?? "",
    location: review.location ?? "",
    label: review.label ?? "",
    published: review.published,
    photo: review.imageUrl,
    photoChanged: false,
  };
}

function useReviewText() {
  const { isArabic } = useSiteLanguage();
  return isArabic
    ? {
        add: "إضافة قصة", edit: "تعديل القصة", name: "اسم العميل", text: "نص التقييم", rating: "التقييم", product: "المنتج (اختياري)", none: "بدون منتج", date: "تاريخ التقييم (اختياري)",
        location: "الموقع (اختياري)", label: "وصف قصير (اختياري)", photo: "صورة العميل (اختيارية)", removePhoto: "إزالة الصورة", publish: "نشر على الصفحة الرئيسية",
        save: "حفظ", saving: "جارٍ الحفظ…", cancel: "إلغاء", preview: "معاينة قبل النشر", previewHint: "هكذا ستظهر القصة على الصفحة الرئيسية.", published: "منشور", draft: "مسودة",
        unpublish: "إلغاء النشر", publishNow: "نشر", up: "نقل لأعلى", down: "نقل لأسفل", remove: "حذف", confirm: "تأكيد الحذف", keep: "إبقاء", empty: "لا توجد قصص بعد. أضف أول قصة من عميل.",
        loading: "جارٍ تحميل القصص…", loadError: "تعذر تحميل القصص.", photoProblem: "اختر صورة JPEG أو PNG أو WebP أصغر من 20 ميجابايت.", failed: "تعذر الحفظ", draftHint: "لن تظهر المسودات للزوار.",
        counter: (used: number) => `${used}/600`, rated: (rating: number) => `${rating} من 5`, newStory: "قصة جديدة", close: "إغلاق النموذج", moveFailed: "تعذر نقل القصة", deleteFailed: "تعذر الحذف",
      }
    : {
        add: "Add a story", edit: "Edit story", name: "Customer name", text: "Review text", rating: "Rating", product: "Product (optional)", none: "No product", date: "Review date (optional)",
        location: "Location (optional)", label: "Short label (optional)", photo: "Customer photo (optional)", removePhoto: "Remove photo", publish: "Show on the homepage",
        save: "Save", saving: "Saving…", cancel: "Cancel", preview: "Preview before publishing", previewHint: "This is how the story will look on the homepage.", published: "Published", draft: "Draft",
        unpublish: "Unpublish", publishNow: "Publish", up: "Move up", down: "Move down", remove: "Delete", confirm: "Confirm delete", keep: "Keep", empty: "No stories yet. Add the first customer story.",
        loading: "Loading stories…", loadError: "Could not load stories.", photoProblem: "Choose a JPEG, PNG, or WebP image smaller than 20 MB.", failed: "Could not save", draftHint: "Drafts are never shown to visitors.",
        counter: (used: number) => `${used}/600`, rated: (rating: number) => `${rating} of 5`, newStory: "New story", close: "Close form", moveFailed: "Could not move the story", deleteFailed: "Could not delete the story",
      };
}

function ReviewEditor({ review, onDone }: { review: AdminReview | null; onDone: () => void }) {
  const { language } = useSiteLanguage();
  const t = useReviewText();
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: ["admin", "products"], queryFn: adminApi.products });
  const [draft, setDraft] = useState<Draft>(() => (review ? draftFrom(review) : emptyDraft));
  const [problem, setProblem] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const chosenProduct = products.data?.find((product) => product.id === draft.productId);

  const save = useMutation({
    mutationFn: async () => {
      const base: ReviewInput = {
        customerName: draft.customerName.trim(),
        body: draft.body.trim(),
        rating: draft.rating,
        productId: draft.productId || null,
        reviewedAt: draft.reviewedAt || null,
        location: draft.location.trim() || null,
        label: draft.label.trim() || null,
        published: draft.published,
      };
      if (draft.photoChanged) {
        if (draft.photo) base.imageDataUrl = draft.photo;
        else base.removeImage = true;
      }
      return review ? adminApi.updateReview(review.id, base) : adminApi.createReview(base);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      onDone();
    },
    onError: (error) => setProblem(friendlyError(error, language)),
  });

  async function choosePhoto(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    if (!REVIEW_PHOTO_TYPES.includes(file.type) || file.size > REVIEW_PHOTO_MAX_BYTES) { setProblem(t.photoProblem); return; }
    try {
      setProblem("");
      setDraft((current) => ({ ...current, photo: null }));
      const dataUrl = await reviewPhotoDataUrl(file);
      setDraft((current) => ({ ...current, photo: dataUrl, photoChanged: true }));
    } catch (error) {
      setProblem(friendlyError(error, language));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProblem("");
    save.mutate();
  }

  return (
    <div className="admin-review-editor">
      <form className="admin-product-form" onSubmit={submit} aria-label={review ? t.edit : t.add}>
        <h2>{review ? t.edit : t.add}</h2>
        <div className="admin-product-form__grid">
          <label>{t.name}<input required minLength={2} maxLength={80} value={draft.customerName} onChange={(event) => set("customerName", event.target.value)} /></label>
          <label>{t.label}<input maxLength={48} value={draft.label} onChange={(event) => set("label", event.target.value)} /></label>
          <label className="admin-product-form__full">
            {t.text}
            <textarea required minLength={10} maxLength={600} rows={4} value={draft.body} onChange={(event) => set("body", event.target.value)} />
            <span className="admin-review-editor__count" aria-hidden="true">{t.counter(draft.body.length)}</span>
          </label>
          <fieldset className="admin-rating">
            <legend>{t.rating}</legend>
            <div className="admin-rating__row">
              {[1, 2, 3, 4, 5].map((step) => (
                <label key={step} className={step <= draft.rating ? "is-on" : undefined}>
                  <input type="radio" name="review-rating" value={step} checked={draft.rating === step} onChange={() => set("rating", step)} aria-label={t.rated(step)} />
                  <LeafIcon />
                </label>
              ))}
            </div>
          </fieldset>
          <label>{t.product}
            <select value={draft.productId} onChange={(event) => set("productId", event.target.value)}>
              <option value="">{t.none}</option>
              {(products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}{product.published === false ? ` (${t.draft})` : ""}</option>)}
            </select>
          </label>
          <label>{t.date}<input type="date" value={draft.reviewedAt} max={new Date().toISOString().slice(0, 10)} onChange={(event) => set("reviewedAt", event.target.value)} /></label>
          <label>{t.location}<input maxLength={60} value={draft.location} onChange={(event) => set("location", event.target.value)} /></label>
          <div className="admin-review-editor__photo admin-product-form__full">
            <span className="admin-review-editor__photo-label">{t.photo}</span>
            <div className="admin-review-editor__photo-row">
              {draft.photo ? <img className="admin-product-form__preview" src={draft.photo} alt="" /> : null}
              <input ref={fileInput} type="file" accept={REVIEW_PHOTO_TYPES.join(",")} aria-label={t.photo} onChange={(event) => void choosePhoto(event.target.files?.[0])} />
              {draft.photo ? <button type="button" className="admin-review-link" onClick={() => setDraft((current) => ({ ...current, photo: null, photoChanged: true }))}>{t.removePhoto}</button> : null}
            </div>
          </div>
          <label className="admin-review-editor__publish admin-product-form__full">
            <input type="checkbox" checked={draft.published} onChange={(event) => set("published", event.target.checked)} />
            <span>{t.publish}</span>
          </label>
        </div>
        {problem ? <p role="alert" className="admin-review-editor__error">{problem}</p> : null}
        <div className="admin-review-editor__actions">
          <button className="primary-button" type="submit" disabled={save.isPending}>{save.isPending ? t.saving : t.save}</button>
          <button type="button" className="admin-review-link" onClick={onDone}>{t.cancel}</button>
          {!draft.published ? <span className="admin-review-editor__hint">{t.draftHint}</span> : null}
        </div>
      </form>

      <section className="admin-review-editor__preview" aria-label={t.preview}>
        <h3>{t.preview}</h3>
        <p>{t.previewHint}</p>
        <div className="story-preview">
          <ReviewSheet
            review={{
              customerName: draft.customerName.trim() || "—",
              body: draft.body.trim() || "…",
              rating: draft.rating,
              imageUrl: draft.photo,
              product: chosenProduct && chosenProduct.published !== false ? { slug: chosenProduct.slug, name: chosenProduct.name, nameAr: chosenProduct.nameAr } : null,
              reviewedAt: draft.reviewedAt || null,
              location: draft.location.trim() || null,
              label: draft.label.trim() || null,
            }}
          />
        </div>
      </section>
    </div>
  );
}

function ReviewRow({ review, index, total, onEdit }: { review: AdminReview; index: number; total: number; onEdit: () => void }) {
  const { language } = useSiteLanguage();
  const t = useReviewText();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    void queryClient.invalidateQueries({ queryKey: ["reviews"] });
  };
  const toggle = useMutation({
    mutationFn: () => adminApi.updateReview(review.id, { published: !review.published }),
    onSuccess: refresh,
    onError: (error) => setProblem(friendlyError(error, language)),
  });
  const move = useMutation({
    mutationFn: (direction: "up" | "down") => adminApi.moveReview(review.id, direction),
    onSuccess: refresh,
    onError: () => setProblem(t.moveFailed),
  });
  const remove = useMutation({
    mutationFn: () => adminApi.deleteReview(review.id),
    onSuccess: refresh,
    onError: () => { setConfirming(false); setProblem(t.deleteFailed); },
  });
  const busy = toggle.isPending || move.isPending || remove.isPending;

  return (
    <li className={`admin-review-card${review.published ? "" : " is-draft"}`}>
      <div className="admin-review-card__photo">
        {review.imageUrl ? <FallbackImage src={review.imageUrl} alt="" /> : <LeafIcon />}
      </div>
      <div className="admin-review-card__main">
        <div className="admin-review-card__head">
          <strong>{review.customerName}</strong>
          <span className="admin-review-card__rating" aria-label={t.rated(review.rating)}>{t.rated(review.rating)}</span>
        </div>
        <p className="admin-review-card__meta">
          {[review.label, review.location, review.productName, review.reviewedAt].filter(Boolean).join(" · ")}
        </p>
        <p className="admin-review-card__text">{review.body}</p>
        {problem ? <p role="alert" className="admin-review-editor__error">{problem}</p> : null}
      </div>
      <div className="admin-review-card__actions">
        <button
          type="button"
          className={`admin-product-status-pill admin-product-status-pill--${review.published ? "published" : "draft"}`}
          aria-pressed={review.published}
          title={review.published ? t.unpublish : t.publishNow}
          disabled={busy}
          onClick={() => { setProblem(""); toggle.mutate(); }}
        >
          {review.published ? t.published : t.draft}
        </button>
        <div className="admin-review-card__order">
          <button type="button" className="admin-icon-button" aria-label={`${t.up}: ${review.customerName}`} disabled={busy || index === 0} onClick={() => { setProblem(""); move.mutate("up"); }}>↑</button>
          <button type="button" className="admin-icon-button" aria-label={`${t.down}: ${review.customerName}`} disabled={busy || index === total - 1} onClick={() => { setProblem(""); move.mutate("down"); }}>↓</button>
        </div>
        <button type="button" className="admin-review-link" disabled={busy} onClick={onEdit}>{t.edit}</button>
        {confirming ? (
          <span className="admin-review-card__confirm">
            <button type="button" className="admin-review-link admin-review-link--danger" disabled={remove.isPending} onClick={() => remove.mutate()}>{t.confirm}</button>
            <button type="button" className="admin-review-link" onClick={() => setConfirming(false)}>{t.keep}</button>
          </span>
        ) : (
          <button type="button" className="admin-review-link admin-review-link--danger" disabled={busy} onClick={() => setConfirming(true)}>{t.remove}</button>
        )}
      </div>
    </li>
  );
}

export function AdminReviewsPage() {
  const { content } = useSiteLanguage();
  const t = useReviewText();
  const reviews = useQuery({ queryKey: ["admin", "reviews"], queryFn: adminApi.reviews });
  // null: closed, "new": the empty form, otherwise the id being edited.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const editingReview = editing && editing !== "new" ? reviews.data?.find((review) => review.id === editing) ?? null : null;
  const items = reviews.data ?? [];

  return (
    <section className="page-shell admin-page" data-testid="admin-reviews-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.reviews}</p>
        <h1>{content.admin.reviews}</h1>
      </div>

      {editing === null ? (
        <button type="button" className="primary-button admin-review-new" onClick={() => setEditing("new")}>+ {t.newStory}</button>
      ) : (
        <ReviewEditor key={editing} review={editingReview} onDone={() => setEditing(null)} />
      )}

      <div className="table-card admin-products-panel">
        {reviews.isPending ? <p className="admin-state">{t.loading}</p> : null}
        {reviews.isError ? <p role="alert" className="admin-state">{t.loadError}</p> : null}
        {reviews.isSuccess && items.length === 0 ? <p className="admin-empty">{t.empty}</p> : null}
        <ul className="admin-review-list">
          {items.map((review, index) => (
            <ReviewRow key={review.id} review={review} index={index} total={items.length} onEdit={() => setEditing(review.id)} />
          ))}
        </ul>
      </div>
    </section>
  );
}
