import { useRef, useState } from "react";
import { ProductImage } from "../../components/ProductImage";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import { PhotoCrossfade } from "./PhotoCrossfade";
import { useAutoAdvance } from "./photo-autoplay";
import { distinctPhotos, groupPhotos } from "./product-photos";
import type { ProductMedia } from "./product-types";

// Shared pieces for product cards and the product page: honest prices, care labels and the photo gallery.

export const priceComingSoon = (isArabic: boolean) => (isArabic ? "السعر قريبًا" : "Price coming soon");
/** A plant customers can order: priced above 0 QAR (a 0 price is shown as "Price coming soon"). */
export const forSale = (product: { priceQar: number }) => product.priceQar > 0;

/** "Was" price and percentage only for a genuine reduction (the server already drops anything else). */
export function ProductPrice({ priceQar, compareAtPriceQar, isArabic, className = "" }: {
  priceQar: number;
  compareAtPriceQar?: number | null;
  isArabic: boolean;
  className?: string;
}) {
  // 0 QAR means the price is not set yet: the plant is shown, but not for sale.
  if (priceQar <= 0) return <span className={`product-price product-price--soon ${className}`.trim()}>{priceComingSoon(isArabic)}</span>;
  const reduced = compareAtPriceQar != null && compareAtPriceQar > priceQar;
  const percent = reduced ? Math.round(((compareAtPriceQar - priceQar) / compareAtPriceQar) * 100) : 0;
  return (
    <span className={`product-price ${className}`.trim()}>
      <span className="product-price__now">{priceQar} QAR</span>
      {reduced ? (
        <>
          <s className="product-price__was" aria-label={isArabic ? `السعر السابق ${compareAtPriceQar} ر.ق` : `Was ${compareAtPriceQar} QAR`}>{compareAtPriceQar} QAR</s>
          {percent > 0 ? <span className="product-price__off">{isArabic ? `خصم ${percent}٪` : `-${percent}%`}</span> : null}
        </>
      ) : null}
    </span>
  );
}

export function careLabels(isArabic: boolean) {
  return isArabic
    ? {
        careLevel: { easy: "سهل العناية", moderate: "عناية متوسطة", demanding: "يحتاج عناية" } as Record<string, string>,
        placement: { indoor: "داخلي", outdoor: "خارجي", "indoor-outdoor": "داخلي أو خارجي" } as Record<string, string>,
        titles: { botanical: "الاسم العلمي", light: "الإضاءة", watering: "الري", care: "العناية", placement: "المكان" },
      }
    : {
        careLevel: { easy: "Easy care", moderate: "Moderate care", demanding: "Needs attention" } as Record<string, string>,
        placement: { indoor: "Indoor", outdoor: "Outdoor", "indoor-outdoor": "Indoor or outdoor" } as Record<string, string>,
        titles: { botanical: "Botanical name", light: "Light", watering: "Watering", care: "Care", placement: "Placement" },
      };
}

/** Media rows grouped back into photographs (catalogue and detail size of each). */
export const photosOf = groupPhotos;

const GALLERY_PHOTO_MS = 5_000;
// A choice the customer makes (thumbnail, arrow) holds the gallery on that photograph for this long.
const MANUAL_HOLD_MS = 15_000;

export function ProductGallery({ media, alt, isArabic }: { media: ProductMedia[]; alt: string; isArabic: boolean }) {
  const photos = distinctPhotos(media);
  const [index, setIndex] = useState(0);
  const heldUntil = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useAutoAdvance(stage, {
    enabled: photos.length > 1 && !reduced,
    periodMs: GALLERY_PHOTO_MS,
    threshold: 0.4,
    advance: () => { if (performance.now() >= heldUntil.current) setIndex((current) => (current + 1) % photos.length); },
  });
  const choose = (position: number) => {
    heldUntil.current = performance.now() + MANUAL_HOLD_MS;
    setIndex((position + photos.length) % photos.length);
  };
  const current = photos[Math.min(index, photos.length - 1)] ?? [];
  const first = photos[0]?.find((item) => item.purpose === "detail") ?? photos[0]?.[0];
  const portrait = Boolean(first?.width && first?.height && first.width / first.height < 0.9);
  const t = isArabic
    ? { photos: "صور المنتج", previous: "الصورة السابقة", next: "الصورة التالية", photo: (n: number) => `الصورة ${n} من ${photos.length}` }
    : { photos: "Product photos", previous: "Previous photo", next: "Next photo", photo: (n: number) => `Photo ${n} of ${photos.length}` };
  return (
    <div className="product-gallery">
      <div ref={stage} className="product-gallery__stage" data-orientation={portrait ? "portrait" : "square"}>
        {photos.length > 1 ? (
          <PhotoCrossfade
            photos={photos}
            index={index}
            alt={alt}
            preferredPurpose="detail"
            imageClassName="product-detail__image"
            testId="product-image"
            loading="eager"
            fetchPriority="high"
            sizes="(max-width: 900px) 100vw, 50vw"
          />
        ) : (
          <ProductImage
            media={current}
            alt={alt}
            preferredPurpose="detail"
            className="product-detail__image"
            data-testid="product-image"
            loading="eager"
            decoding="async"
            sizes="(max-width: 900px) 100vw, 50vw"
            fetchPriority="high"
          />
        )}
      </div>
      {photos.length > 1 ? (
        <div className="product-gallery__controls">
          <button type="button" className="product-gallery__step" aria-label={t.previous} onClick={() => choose(index - 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5 8 12l7 7" /></svg>
          </button>
          <div className="product-gallery__thumbs" role="group" aria-label={t.photos}>
            {photos.map((photo, position) => {
              const thumb = photo.find((item) => item.purpose === "catalog") ?? photo[0];
              return (
                <button
                  key={thumb.url}
                  type="button"
                  className="product-gallery__thumb"
                  aria-label={t.photo(position + 1)}
                  aria-pressed={position === index}
                  onClick={() => choose(position)}
                >
                  <img src={thumb.url} alt="" width={72} height={72} loading="lazy" decoding="async" />
                </button>
              );
            })}
          </div>
          <button type="button" className="product-gallery__step" aria-label={t.next} onClick={() => choose(index + 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
