import { useState } from "react";
import { ProductImage } from "../../components/ProductImage";
import type { ProductMedia } from "./product-types";

// Shared pieces for product cards and the product page: honest prices, care labels and the photo gallery.

/** "Was" price and percentage only for a genuine reduction (the server already drops anything else). */
export function ProductPrice({ priceQar, compareAtPriceQar, isArabic, className = "" }: {
  priceQar: number;
  compareAtPriceQar?: number | null;
  isArabic: boolean;
  className?: string;
}) {
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

/** Media rows come as catalog/detail pairs, one pair per photograph; this groups them back into photos. */
export function photosOf(media: ProductMedia[]): ProductMedia[][] {
  const photos: ProductMedia[][] = [];
  for (const item of media) {
    const last = photos[photos.length - 1];
    if (last && last.length === 1 && last[0].purpose === "catalog" && item.purpose === "detail") last.push(item);
    else photos.push([item]);
  }
  return photos;
}

export function ProductGallery({ media, alt, isArabic }: { media: ProductMedia[]; alt: string; isArabic: boolean }) {
  const photos = photosOf(media);
  const [index, setIndex] = useState(0);
  const current = photos[Math.min(index, photos.length - 1)] ?? [];
  return (
    <div className="product-gallery">
      <ProductImage
        key={index}
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
      {photos.length > 1 ? (
        <div className="product-gallery__thumbs" role="group" aria-label={isArabic ? "صور المنتج" : "Product photos"}>
          {photos.map((photo, position) => {
            const thumb = photo.find((item) => item.purpose === "catalog") ?? photo[0];
            return (
              <button
                key={thumb.url}
                type="button"
                className="product-gallery__thumb"
                aria-label={isArabic ? `الصورة ${position + 1} من ${photos.length}` : `Photo ${position + 1} of ${photos.length}`}
                aria-pressed={position === index}
                onClick={() => setIndex(position)}
              >
                <img src={thumb.url} alt="" width={72} height={72} loading="lazy" decoding="async" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
