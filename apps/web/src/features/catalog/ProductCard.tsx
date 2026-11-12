import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { prefetchRoute } from "../../app/route-modules";
import { ProductImage } from "../../components/ProductImage";
import { AddToCartButton } from "../cart/AddToCartButton";
import { localizeProduct } from "./localize-product";
import { productApi } from "./product-api";
import type { ProductSummary } from "./product-types";
import { ProductPrice } from "./product-presentation";

export function ProductCard({
  product,
  orderingEnabled,
  headingLevel = 2,
  eager = false,
}: {
  product: ProductSummary;
  orderingEnabled: boolean;
  headingLevel?: 2 | 3;
  eager?: boolean;
}) {
  const { content, language, isArabic } = useSiteLanguage();
  const queryClient = useQueryClient();
  const localized = localizeProduct(product, isArabic);
  const Heading = headingLevel === 2 ? "h2" : "h3";

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
      <div className="product-card__media">
        <ProductImage
          media={product.media?.length ? product.media : product.image}
          alt={isArabic ? localized.name : product.image?.altText || localized.name}
          loading={eager ? "eager" : "lazy"}
          sizes="(max-width: 520px) 50vw, (max-width: 1024px) 33vw, 280px"
        />
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
