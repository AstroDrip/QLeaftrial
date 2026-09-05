import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSiteContent, useSiteLanguage } from "../../app/providers";
import { productApi } from "./product-api";
import { AddToCartButton } from "../cart/AddToCartButton";
import { Seo } from "../../components/Seo";
import { FallbackImage } from "../../components/FallbackImage";
import "./product-detail.css";

export function ProductPage() {
  const content = useSiteContent();
  const { language } = useSiteLanguage();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const fallbackSlug = slug ?? "unknown";

  const { data: product, isPending, isError, error } = useQuery({
    queryKey: ["product", fallbackSlug, language],
    queryFn: () => productApi.detail(fallbackSlug, language),
    staleTime: 120_000,
  });

  if (isPending) return <p data-testid="product-loading" className="product-detail">{content.product.loading}</p>;

  if (isError) {
    return (
      <section className="product-detail" data-testid="product-error">
        <p role="alert">{content.product.notFound}: {(error as Error).message}</p>
        <button type="button" onClick={() => navigate(-1)}>{language === "ar" ? "رجوع" : "Back"}</button>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="product-detail" data-testid="product-not-found">
        <h1>{content.product.notFound}</h1>
        <Link to="/shop">{content.order.backToShop}</Link>
      </section>
    );
  }

  const primaryImage = product.media[0] ?? product.image;
  return (
    <article className="product-detail" data-testid="product-page">
      <Seo title={product.name} description={product.description} path={`/plants/${product.slug}`} image={primaryImage?.url} structuredData={{
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.description,
        image: product.media.map((media) => new URL(media.url, "https://qleaves.qa").toString()),
        offers: { "@type": "Offer", priceCurrency: "QAR", price: product.priceQar, availability: product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `https://qleaves.qa/plants/${product.slug}` },
      }} />
      <FallbackImage src={primaryImage?.url ?? "/images/hero/leaf-1.svg"} alt={primaryImage?.altText || product.name} className="product-detail__image" data-testid="product-image" loading="eager" decoding="async" fetchPriority="high" />

      <div className="product-detail__meta">
        <h1 className="product-detail__name" data-testid="product-name">{product.name}</h1>
        <p className="product-detail__price" data-testid="product-price">{product.priceQar} QAR</p>
        <p className="product-detail__stock" data-testid={product.inStock ? "in-stock" : "out-of-stock"}>
          {product.inStock ? content.product.inStock : content.product.outOfStock}
        </p>
        <p className="product-detail__description">{product.description}</p>
        <ul className="product-detail__facts" data-testid="care-facts">
          <li><span>{content.product.category}:</span> {product.category}</li>
          <li><span>{content.product.lightNeeds}:</span> {product.light}</li>
        </ul>
        <AddToCartButton product={product} className="product-detail__cart" />
      </div>
    </article>
  );
}
