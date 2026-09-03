import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { productApi } from "./product-api";
import { content } from "../../content/en";
import "./product-detail.css";

export function ProductPage() {
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
        Loading plant…
      </p>
    );
  }

  if (isError) {
    return (
      <section className="product-detail" data-testid="product-error">
        <p role="alert">
          {content.errors.retryFailed}: {(error as Error).message}
        </p>
        <button type="button" onClick={() => navigate(-1)}>
          Back
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
  const arAsset = product.arAsset;

  return (
    <article className="product-detail" data-testid="product-page">
      {primaryImage ? (
        <img
          src={primaryImage.url}
          alt={primaryImage.altText}
          className="product-detail__image"
          data-testid="product-image"
        />
      ) : (
        <div className="product-detail__image" data-testid="product-image" />
      )}

      <div className="product-detail__meta">
        <h1 className="product-detail__name" data-testid="product-name">
          {product.name}
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
          {product.description}
        </p>

        <ul className="product-detail__facts" data-testid="care-facts">
          <li>
            <span>{content.product.category}:</span> {product.category}
          </li>
          <li>
            <span>{content.product.lightNeeds}:</span> {product.light}
          </li>
        </ul>
      </div>
    </article>
  );
}

