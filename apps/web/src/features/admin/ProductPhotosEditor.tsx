import { useEffect, useRef, useState, type DragEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { FallbackImage } from "../../components/FallbackImage";
import { ApiClientError } from "../../lib/api-error";
import { friendlyError } from "../../lib/friendly-error";
import { useSiteLanguage } from "../../app/providers";
import { MAX_PRODUCT_PHOTOS, adminApi, photoFingerprint, type AdminPhoto, type AdminProduct, type PhotoProgress } from "./admin-api";
import { acceptedPhotoTypes, imageProblem } from "./product-photo-files";

// A product's photographs in admin: up to three, the first is the main one. Choose a photo in the strip to see it
// large and act on it (make main, move, replace, remove, describe); empty slots add a photo; photos can also be
// dragged into a new order. Each change is saved on its own and the card shows the product as the server returns it.
const copy = {
  en: {
    photos: "Photos", photo: (n: number, total: number) => `Photo ${n} of ${total}`, main: "Main", add: "Add photo", makeMain: "Make main",
    earlier: "Move earlier", later: "Move later", replace: "Replace", remove: "Remove", removeAsk: "Remove this photo?", yes: "Yes, remove", no: "Keep",
    describe: "Photo description", save: "Save", preparing: "Preparing the photo…", uploading: (done: number, total: number) => `Uploading size ${done + 1} of ${total}…`,
    saving: "Saving…", duplicate: "This photo is already on this product.", limit: `A product can have up to ${MAX_PRODUCT_PHOTOS} photos.`, last: "A product needs at least one photo. Replace it instead.",
    changed: "The photos changed in the meantime. The latest version is shown; try again.", saved: "Saved", missing: (n: number) => `${n} of ${MAX_PRODUCT_PHOTOS} photos`,
    describeShort: "Describe the photo in 2 to 200 characters.",
  },
  ar: {
    photos: "الصور", photo: (n: number, total: number) => `الصورة ${n} من ${total}`, main: "الرئيسية", add: "إضافة صورة", makeMain: "اجعلها الرئيسية",
    earlier: "تقديم", later: "تأخير", replace: "استبدال", remove: "حذف", removeAsk: "حذف هذه الصورة؟", yes: "نعم، احذف", no: "إبقاء",
    describe: "وصف الصورة", save: "حفظ", preparing: "جارٍ تجهيز الصورة…", uploading: (done: number, total: number) => `جارٍ رفع الحجم ${done + 1} من ${total}…`,
    saving: "جارٍ الحفظ…", duplicate: "هذه الصورة موجودة بالفعل لهذا المنتج.", limit: `يمكن أن يكون للمنتج ${MAX_PRODUCT_PHOTOS} صور كحد أقصى.`, last: "يحتاج المنتج إلى صورة واحدة على الأقل. استبدلها بدلًا من ذلك.",
    changed: "تغيّرت الصور في الأثناء. تظهر الآن أحدث نسخة؛ حاول مرة أخرى.", saved: "تم الحفظ", missing: (n: number) => `${n} من ${MAX_PRODUCT_PHOTOS} صور`,
    describeShort: "صف الصورة في 2 إلى 200 حرف.",
  },
} as const;

type Action =
  | { kind: "add"; file: File }
  | { kind: "replace"; key: string; file: File }
  | { kind: "remove"; key: string }
  | { kind: "order"; keys: string[] }
  | { kind: "describe"; key: string; altText: string };

export function ProductPhotosEditor({ product, onSaved, onStale }: { product: AdminProduct; onSaved: (product: AdminProduct) => void; onStale: () => void }) {
  const { isArabic } = useSiteLanguage();
  const t = copy[isArabic ? "ar" : "en"];
  const photos: AdminPhoto[] = product.photos?.length ? product.photos : product.image ? [{ key: "", url: product.image.url, detailUrl: null, altText: product.image.altText, width: null, height: null, contentHash: null }] : [];
  const [selected, setSelected] = useState(0);
  const [progress, setProgress] = useState<PhotoProgress | null>(null);
  const [problem, setProblem] = useState("");
  const [asking, setAsking] = useState(false);
  const [altText, setAltText] = useState(photos[0]?.altText ?? "");
  const [dragging, setDragging] = useState<number | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const current = photos[Math.min(selected, photos.length - 1)];

  useEffect(() => { setAltText(current?.altText ?? ""); setAsking(false); }, [current?.key, current?.altText]);

  const run = useMutation({
    mutationFn: (action: Action) => {
      const alt = current?.altText || product.name;
      switch (action.kind) {
        case "add": return adminApi.addPhoto(product.id, action.file, product.name, setProgress);
        case "replace": return adminApi.replacePhoto(product.id, action.key, action.file, alt, setProgress);
        case "remove": return adminApi.removePhoto(product.id, action.key);
        case "order": return adminApi.reorderPhotos(product.id, action.keys);
        case "describe": return adminApi.describePhoto(product.id, action.key, action.altText);
      }
    },
    scope: { id: `admin-product-photos-${product.id}` },
    onMutate: () => { setProblem(""); },
    onSuccess: (updated, action) => {
      onSaved(updated);
      if (action.kind === "add") setSelected((updated.photos?.length ?? 1) - 1);
      if (action.kind === "remove") setSelected((index) => Math.max(0, Math.min(index, (updated.photos?.length ?? 1) - 1)));
      if (action.kind === "order") setSelected(action.keys.indexOf(current?.key ?? "") >= 0 ? action.keys.indexOf(current!.key) : 0);
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        if (error.code === "DUPLICATE_PHOTO") return setProblem(t.duplicate);
        if (error.code === "PHOTO_LIMIT") return setProblem(t.limit);
        if (error.code === "LAST_PHOTO") return setProblem(t.last);
        if (error.code === "PHOTOS_CHANGED" || error.code === "PHOTO_NOT_FOUND") { onStale(); return setProblem(t.changed); }
      }
      setProblem(friendlyError(error, isArabic ? "ar" : "en"));
    },
    onSettled: () => setProgress(null),
  });
  const busy = run.isPending;

  async function choose(file: File | undefined, kind: "add" | "replace") {
    if (addInput.current) addInput.current.value = "";
    if (replaceInput.current) replaceInput.current.value = "";
    if (!file) return;
    const issue = imageProblem(file, isArabic);
    if (issue) return setProblem(issue);
    // The same picture as one already on the product is caught before anything is uploaded (the server checks too).
    const fingerprint = await photoFingerprint(file);
    if (fingerprint && photos.some((photo, index) => photo.contentHash === fingerprint && !(kind === "replace" && index === selected))) return setProblem(t.duplicate);
    run.mutate(kind === "add" ? { kind: "add", file } : { kind: "replace", key: current.key, file });
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const keys = photos.map((photo) => photo.key);
    const [key] = keys.splice(from, 1);
    keys.splice(to, 0, key);
    run.mutate({ kind: "order", keys });
  };

  const onDrop = (event: DragEvent<HTMLLIElement>, index: number) => {
    event.preventDefault();
    if (dragging !== null) move(dragging, index);
    setDragging(null);
  };

  const status = progress?.step === "preparing" ? t.preparing : progress?.step === "uploading" ? t.uploading(progress.done, progress.total) : progress?.step === "saving" || busy ? t.saving : "";
  const editable = photos.length > 0 && Boolean(current?.key);

  return (
    <div className="admin-photos" data-testid="product-photos-editor">
      <div className={`admin-photos__main${busy ? " is-busy" : ""}`}>
        <FallbackImage className="admin-product-card__image" src={current?.detailUrl ?? current?.url ?? "/images/hero/leaf-1.svg"} alt={current?.altText ?? ""} />
        {status ? <span className="admin-photos__status" role="status">{status}</span> : null}
      </div>

      <ol className="admin-photos__strip" aria-label={`${product.name}: ${t.photos}`}>
        {photos.map((photo, index) => (
          <li
            key={photo.key || photo.url}
            className={`admin-photos__slot${dragging === index ? " is-dragging" : ""}`}
            draggable={editable && !busy && photos.length > 1}
            onDragStart={() => setDragging(index)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => { if (dragging !== null) event.preventDefault(); }}
            onDrop={(event) => onDrop(event, index)}
          >
            <button
              type="button"
              className="admin-photos__thumb"
              aria-pressed={index === selected}
              aria-label={`${t.photo(index + 1, photos.length)}${index === 0 ? ` (${t.main})` : ""}`}
              onClick={() => setSelected(index)}
            >
              <img src={photo.url} alt="" width={64} height={64} loading="lazy" decoding="async" draggable={false} />
            </button>
            {index === 0 ? <span className="admin-photos__badge">{t.main}</span> : null}
          </li>
        ))}
        {Array.from({ length: Math.max(0, MAX_PRODUCT_PHOTOS - photos.length) }, (_, index) => (
          <li key={`empty-${index}`} className="admin-photos__slot">
            <button type="button" className="admin-photos__add" disabled={busy || !editable} onClick={() => addInput.current?.click()} aria-label={`${t.add} (${product.name})`}>
              <span aria-hidden="true">+</span>
              <span>{t.add}</span>
            </button>
          </li>
        ))}
      </ol>
      <input ref={addInput} type="file" hidden accept={acceptedPhotoTypes()} aria-label={`${product.name}: ${t.add}`} onChange={(event) => void choose(event.target.files?.[0], "add")} />
      <input ref={replaceInput} type="file" hidden accept={acceptedPhotoTypes()} aria-label={`${product.name}: ${t.replace}`} onChange={(event) => void choose(event.target.files?.[0], "replace")} />

      {editable ? (
        <>
          <div className="admin-photos__actions" role="group" aria-label={t.photo(selected + 1, photos.length)}>
            <button type="button" disabled={busy || selected === 0} onClick={() => move(selected, 0)}>{t.makeMain}</button>
            <button type="button" disabled={busy || selected === 0} onClick={() => move(selected, selected - 1)}>{t.earlier}</button>
            <button type="button" disabled={busy || selected >= photos.length - 1} onClick={() => move(selected, selected + 1)}>{t.later}</button>
            <button type="button" disabled={busy} onClick={() => replaceInput.current?.click()}>{t.replace}</button>
            <button type="button" className="admin-photos__remove" disabled={busy || photos.length <= 1} onClick={() => setAsking(true)}>{t.remove}</button>
          </div>
          {asking ? (
            <div className="admin-photos__confirm" role="group" aria-label={t.removeAsk}>
              <span>{t.removeAsk}</span>
              <button type="button" onClick={() => setAsking(false)}>{t.no}</button>
              <button type="button" className="admin-photos__remove" onClick={() => { setAsking(false); run.mutate({ kind: "remove", key: current.key }); }}>{t.yes}</button>
            </div>
          ) : null}
          <form
            className="admin-photos__describe"
            onSubmit={(event) => {
              event.preventDefault();
              const value = altText.trim();
              if (value.length < 2 || value.length > 200) return setProblem(t.describeShort);
              run.mutate({ kind: "describe", key: current.key, altText: value });
            }}
          >
            <label>
              <span>{t.describe}</span>
              <input value={altText} maxLength={200} onChange={(event) => setAltText(event.target.value)} />
            </label>
            <button type="submit" disabled={busy || altText.trim() === current.altText}>{t.save}</button>
          </form>
        </>
      ) : null}
      {problem ? <p role="alert" className="admin-photos__error">{problem}</p> : null}
    </div>
  );
}

/** "1 of 3 photos" on a product that has fewer than three. */
export function photosShortLabel(product: AdminProduct, isArabic: boolean): string | null {
  const count = product.photos?.length ?? (product.image ? 1 : 0);
  return count >= MAX_PRODUCT_PHOTOS ? null : copy[isArabic ? "ar" : "en"].missing(count);
}
