import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { prefetchRoute } from "../../app/route-modules";
import { ProductImage } from "../../components/ProductImage";
import { AddToCartButton } from "../cart/AddToCartButton";
import { localizeProduct } from "./localize-product";
import { productApi } from "./product-api";
import type { ProductMedia, ProductSummary } from "./product-types";
import { ProductPrice } from "./product-presentation";
import { PhotoCrossfade } from "./PhotoCrossfade";
import { useAutoAdvance } from "./photo-autoplay";
import { distinctPhotos } from "./product-photos";
import { useReducedMotion } from "../../lib/use-reduced-motion";

const CARD_PHOTO_MS = 4_500;
const CARD_SIZES = "(max-width: 520px) 50vw, (max-width: 1024px) 33vw, 280px";

function orientationOf(media: ProductMedia | undefined): "portrait" | "square" {
  return media?.width && media?.height && media.width / media.height < 0.9 ? "portrait" : "square";
}

/** A card's photographs: the first at once, then the others by crossfade while the card is on screen. */
function CardPhotos({ photos, alt, eager, startPhoto = 0 }: { photos: ProductMedia[][]; alt: string; eager: boolean; startPhoto?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(() => startPhoto % photos.length);
  useAutoAdvance(box, { enabled: photos.length > 1 && !reduced, periodMs: CARD_PHOTO_MS, advance: () => setIndex((current) => (current + 1) % photos.length) });
  return (
    <div ref={box} className="product-card__photos" data-photos={photos.length}>
      <PhotoCrossfade photos={photos} index={index} alt={alt} loading={eager ? "eager" : "lazy"} sizes={CARD_SIZES} />
    </div>
  );
}

export function ProductCard({
  product,
  orderingEnabled,
  headingLevel = 2,
  eager = false,
  startPhoto = 0,
}: {
  product: ProductSummary;
  orderingEnabled: boolean;
  headingLevel?: 2 | 3;
  eager?: boolean;
  /** Which of the product's photographs the card opens on (the homepage varies it). */
  startPhoto?: number;
}) {
  const { content, language, isArabic } = useSiteLanguage();
  const queryClient = useQueryClient();
  const localized = localizeProduct(product, isArabic);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  // Up to three different photographs (the same picture is never shown twice).
  const photos = distinctPhotos(product.media?.length ? product.media : product.image ? [product.image] : []);
  const alt = isArabic ? localized.name : product.image?.altText || localized.name;

  // Warm the product page (code and data) when the shopper shows intent.
  function prefetch() {
    prefetchRoute(`/plants/${product.slug}`);
    void queryClient.prefetchQuery({
      queryKey: ["product", product.slug, language],
      queryFn: () => productApi.detail(`${encodeURIComponent(product.slug)}?lang=${language}`),
      staleTime: 300_000,
    });
  }

  return (
    <li className="product-card" dir={isArabic ? "rtl" : "ltr"} lang={language} onMouseEnter={prefetch} onFocus={prefetch}>
      <div className="product-card__media" data-orientation={orientationOf((photos[0] ?? []).find((item) => item.purpose === "catalog") ?? photos[0]?.[0])}>
        {photos.length > 1 ? (
          <CardPhotos photos={photos} alt={alt} eager={eager} startPhoto={startPhoto} />
        ) : (
          <ProductImage media={photos[0] ?? product.image} alt={alt} loading={eager ? "eager" : "lazy"} sizes={CARD_SIZES} />
        )}
        {orderingEnabled && !product.inStock ? <span className="product-card__badge">{content.product.outOfStock}</span> : null}
        {orderingEnabled && product.inStock && product.compareAtPriceQar && product.compareAtPriceQar > product.priceQar ? (
          <span className="product-card__badge product-card__badge--offer">{isArabic ? "عرض" : "Offer"}</span>
        ) : null}
      </div>
      <Heading className="product-card__name" title={localized.name}>
        <Link to={`/plants/${product.slug}`} className="product-card__link" data-testid={`view-${product.slug}`}>
          {localized.name}
        </Link>
      </Heading>
      {/* Pinned to the card bottom so prices and buttons line up across a row. */}
      <div className="product-card__footer">
        <div className="product-card__meta">
          <span className="product-card__category">{localized.category}</span>
          {orderingEnabled ? <ProductPrice className="product-card__price" priceQar={product.priceQar} compareAtPriceQar={product.compareAtPriceQar} isArabic={isArabic} /> : null}
        </div>
        {orderingEnabled ? <AddToCartButton product={product} className="product-card__cart" /> : null}
      </div>
    </li>
  );
}
