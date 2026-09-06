import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { productApi } from "./product-api";
import { useSiteLanguage } from "../../app/providers";
import { localizeProduct } from "./localize-product";
import { AddToCartButton } from "../cart/AddToCartButton";
import { Seo } from "../../components/Seo";
import { ProductImage } from "../../components/ProductImage";
import "./product-detail.css";

export function ProductPage() {
  const { content, isArabic } = useSiteLanguage();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const fallbackSlug = slug ?? "unknown";

  const {
    data: product,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["product", fallbackSlug],
    queryFn: () => productApi.detail(fallbackSlug),
    staleTime: 300_000,
  });

  if (isPending) {
    return (
      <p data-testid="product-loading" className="product-detail">
        {isArabic ? "جارٍ تحميل النبات…" : "Loading plant…"}
      </p>
    );
  }

  if (isError) {
    return (
      <section className="product-detail" data-testid="product-error">
        <p role="alert">
          {content.errors.retryFailed}{isArabic ? "" : `: ${(error as Error).message}`}
        </p>
        <button type="button" onClick={() => navigate(-1)}>
          {content.common.back}
        </button>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="product-detail" data-testid="product-not-found">
        <h1>{content.errors.retryFailed}</h1>
        <Link to="/shop">{content.catalog.noResults}</Link>
      </section>
    );
  }

  const primaryImage = product.media[0] ?? product.image;
  const localized = localizeProduct(product, isArabic);
  return (
    <article className="product-detail" data-testid="product-page">
      <Seo
        title={localized.name}
        description={localized.description}
        path={`/plants/${product.slug}`}
        image={primaryImage?.url}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: localized.name,
          description: localized.description,
          image: product.media.map((media) => new URL(media.url, "https://qleaves.qa").toString()),
          offers: { "@type": "Offer", priceCurrency: "QAR", price: product.priceQar, availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `https://qleaves.qa/plants/${product.slug}` },
        }}
      />
      <ProductImage
        media={product.media.length > 0 ? product.media : primaryImage}
        alt={isArabic ? localized.name : primaryImage?.altText || localized.name}
        preferredPurpose="detail"
        className="product-detail__image"
        data-testid="product-image"
        loading="eager"
        decoding="async"
        sizes="(max-width: 900px) 100vw, 50vw"
        fetchPriority="high"
      />

      <div className="product-detail__meta">
        <h1 className="product-detail__name" data-testid="product-name">
          {localized.name}
        </h1>
        <p className="product-detail__price" data-testid="product-price">
          {product.priceQar} QAR
        </p>
        <p
          className="product-detail__stock"
          data-testid={product.inStock ? "in-stock" : "out-of-stock"}
        >
          {product.inStock
            ? content.product.inStock
            : content.product.outOfStock}
        </p>
        <p className="product-detail__description">
          {localized.description}
        </p>

        <ul className="product-detail__facts" data-testid="care-facts">
          <li>
            <span>{content.product.category}:</span> {localized.category}
          </li>
          <li>
            <span>{content.product.lightNeeds}:</span> {localized.light}
          </li>
        </ul>
        <AddToCartButton product={product} className="product-detail__cart" />
      </div>
    </article>
  );
}

