import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSiteLanguage, useStoreSettings } from "../../app/providers";
import { productApi } from "./product-api";
import { localizeProduct } from "./localize-product";
import { AddToCartButton } from "../cart/AddToCartButton";
import { ProductCard } from "./ProductCard";
import { whatsappLink } from "../../content/contact";
import { WhatsAppIcon } from "../../components/icons";
import { Seo } from "../../components/Seo";
import { ProductImage } from "../../components/ProductImage";
import "./product-detail.css";

export function ProductPage() {
  const { content, language, isArabic } = useSiteLanguage();
  const settings = useStoreSettings();
  const orderingEnabled = settings.data?.orderingEnabled ?? true;
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const fallbackSlug = slug ?? "unknown";

  const {
    data: product,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["product", fallbackSlug, language],
    queryFn: () => productApi.detail(`${encodeURIComponent(fallbackSlug)}?lang=${language}`),
    staleTime: 300_000,
  });
  const related = useQuery({
    queryKey: ["products", { category: product?.category, page: 1, lang: language, related: true }],
    queryFn: () => productApi.list({ category: product!.category, page: 1, lang: language }),
    enabled: Boolean(product?.category),
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
        <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
          <button type="button" className="button button-primary" onClick={() => refetch()} data-testid="product-retry">
            {content.errors.retry}
          </button>
          <button type="button" className="button button-secondary" onClick={() => navigate(-1)}>
            {content.common.back}
          </button>
        </div>
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
    <article className="product-detail container" data-testid="product-page">
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
          ...(orderingEnabled ? {
            offers: {
              "@type": "Offer",
              priceCurrency: "QAR",
              price: product.priceQar,
              availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              url: `https://qleaves.qa/plants/${product.slug}`,
            },
          } : {}),
        }}
      />
      <nav className="product-detail__crumbs" aria-label={isArabic ? "مسار التنقل" : "Breadcrumb"}>
        <Link to="/shop">{content.nav.shop}</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/shop?category=${encodeURIComponent(product.category)}`}>{localized.category}</Link>
      </nav>
      <div className="product-detail__main">
      <div className="product-detail__media">
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
      </div>

      <div className="product-detail__meta">
        <p className="eyebrow">{localized.category}</p>
        <h1 className="product-detail__name" data-testid="product-name">
          {localized.name}
        </h1>
        {orderingEnabled ? (
          <p className="product-detail__price" data-testid="product-price">
            {product.priceQar} QAR
          </p>
        ) : null}
        {orderingEnabled ? (
          <p
            className="product-detail__stock"
            data-testid={product.inStock ? "in-stock" : "out-of-stock"}
          >
            {product.inStock ? content.product.inStock : content.product.outOfStock}
          </p>
        ) : null}
        <p className="product-detail__description">
          {localized.description}
        </p>

        <ul className="product-detail__facts" data-testid="care-facts">
          <li>
            <span>{content.product.category}:</span> {localized.category}
          </li>
          {localized.light ? (
            <li>
              <span>{content.product.lightNeeds}:</span> {localized.light}
            </li>
          ) : null}
        </ul>
        {orderingEnabled ? <AddToCartButton product={product} className="product-detail__cart" /> : null}
        <a className="product-detail__ask" href={whatsappLink(isArabic ? `مرحبًا، أود الاستفسار عن ${localized.name}` : `Hi, I'd like to ask about ${product.name}`)} target="_blank" rel="noreferrer">
          <WhatsAppIcon /> {isArabic ? "اسأل عن هذا النبات" : "Ask about this plant"}
        </a>
      </div>
      </div>

      {related.data && related.data.items.some((item) => item.id !== product.id) ? (
        <section className="product-detail__related" aria-labelledby="related-heading">
          <h2 id="related-heading">{isArabic ? "قد يعجبك أيضًا" : "You may also like"}</h2>
          <ul className="product-grid">
            {related.data.items.filter((item) => item.id !== product.id).slice(0, 4).map((item) => (
              <ProductCard key={item.id} product={item} orderingEnabled={orderingEnabled} headingLevel={3} />
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
