import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { productApi } from "./product-api";
import type { ProductListParams } from "./product-types";
import { useSiteLanguage } from "../../app/providers";
import { localizeProduct } from "./localize-product";
import { AddToCartButton } from "../cart/AddToCartButton";
import { Seo } from "../../components/Seo";
import { ProductImage } from "../../components/ProductImage";
import "./catalog.css";

const SORT_OPTIONS = [
  { value: "name-asc", label: "sortNameAsc" },
  { value: "price-asc", label: "sortPriceAsc" },
  { value: "price-desc", label: "sortPriceDesc" },
] as const;

export function CatalogPage() {
  const { content, isArabic } = useSiteLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(
    searchParams.get("q") ?? "",
  );

  const requestedSort = searchParams.get("sort");
  const sort: ProductListParams["sort"] = SORT_OPTIONS.some(
    (option) => option.value === requestedSort,
  ) ? requestedSort as ProductListParams["sort"] : "name-asc";

  const params: ProductListParams = {
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") || undefined,
    light: searchParams.get("light") || undefined,
    page: Number(searchParams.get("page") ?? 1) || 1,
    sort,
  };

  const {
    data: filters,
    isPending: filtersPending,
  } = useQuery({
    queryKey: ["catalog-filters"],
    queryFn: () => productApi.filters(),
  });

  const {
    data: result,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["products", params],
    queryFn: () => productApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  const totalPages = result?.totalPages ?? 0;

  function applyFilter(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      next.delete("page");
      return next;
    });
  }

  function clearFilters() {
    setSearchParams({});
  }

  function goTo(page: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", String(page));
      return next;
    });
  }

  function toggleSort(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("sort", value);
      next.delete("page");
      return next;
    });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (searchValue.trim()) {
        next.set("q", searchValue);
      } else {
        next.delete("q");
      }
      next.delete("page");
      return next;
    });
  }

  return (
    <section className="catalog" data-testid="catalog-page">
      <Seo title={content.catalog.title} description={isArabic ? "تسوق نباتات QLeaves الداخلية المتوفرة في قطر مع الأسعار والمخزون الحالي." : "Shop QLeaves indoor plants available in Qatar, with current prices and stock."} path="/shop" />
      <h1 className="catalog__title">{content.catalog.title}</h1>

      <form
        className="catalog__search"
        onSubmit={submitSearch}
        role="search"
        data-testid="catalog-search"
      >
        <label htmlFor="catalog-search-input" className="sr-only">
          {content.catalog.searchPlaceholder}
        </label>
        <input
          id="catalog-search-input"
          type="search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder={content.catalog.searchPlaceholder}
          data-testid="search-input"
        />
        <button type="submit" data-testid="search-submit">
          {content.common.search}
        </button>
      </form>

      <div className="catalog__filters" data-testid="catalog-filters">
        <label>
          {content.catalog.filterCategory}
          <select
            value={params.category ?? ""}
            onChange={(e) =>
              e.target.value
                ? applyFilter("category", e.target.value)
                : setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("category");
                    return next;
                  })
            }
            data-testid="category-filter"
            disabled={filtersPending}
          >
            <option value="">{content.catalog.filterAllCategories}</option>
            {filters?.categories.map((cat) => (
              <option key={cat} value={cat}>
                {isArabic ? filters.categoryLabels?.[cat] || cat : cat}
              </option>
            ))}
          </select>
        </label>

        <label>
          {content.catalog.filterLight}
          <select
            value={params.light ?? ""}
            onChange={(e) =>
              e.target.value
                ? applyFilter("light", e.target.value)
                : setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("light");
                    return next;
                  })
            }
            data-testid="light-filter"
            disabled={filtersPending}
          >
            <option value="">{content.catalog.filterAllLights}</option>
            {filters?.lights.map((light) => (
              <option key={light} value={light}>
                {isArabic ? filters.lightLabels?.[light] || light : light}
              </option>
            ))}
          </select>
        </label>

        <label>
          {content.catalog.sortBy}
          <select
            value={sort}
            onChange={(e) => toggleSort(e.target.value)}
            data-testid="sort-select"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {content.catalog[opt.label]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={clearFilters}
          data-testid="clear-filters"
        >
          {content.common.clear}
        </button>
      </div>

      {isError ? (
        <p role="alert" data-testid="catalog-error">
          {content.errors.retryFailed}{isArabic ? "" : `: ${(error as Error).message}`}
        </p>
      ) : (
        <>
          {isPending ? (
            <p data-testid="catalog-loading">{isArabic ? "جارٍ تحميل النباتات…" : "Loading plants…"}</p>
          ) : !result || result.items.length === 0 ? (
            <p data-testid="catalog-empty">
              {content.catalog.noResults}
            </p>
          ) : (
            <ul
              className="catalog__grid"
              data-testid="product-grid"
              aria-label={content.catalog.title}
            >
              {result.items.map((product) => {
                const localized = localizeProduct(product, isArabic);
                return <li key={product.id} className="product-card">
                  <ProductImage
                    media={product.media ?? product.image}
                    alt={isArabic ? localized.name : product.image?.altText || localized.name}
                    className="product-card__image"
                    loading="lazy"
                    decoding="async"
                    sizes="(max-width: 720px) 100vw, 33vw"
                  />
                  <h2 className="product-card__name">{localized.name}</h2>
                  <p className="product-card__price">
                    {product.priceQar} QAR
                  </p>
                  <Link
                    to={`/plants/${product.slug}`}
                    className="product-card__link"
                    data-testid={`view-${product.slug}`}
                  >
                    {content.catalog.viewProduct(localized.name)}
                  </Link>
                  <AddToCartButton product={product} className="product-card__cart" />
                </li>;
              })}
            </ul>
          )}

          {result && totalPages > 1 && (
            <nav
              className="catalog__pagination"
              aria-label={content.aria.pagination}
              data-testid="pagination"
            >
              <button
                type="button"
                onClick={() => goTo(result.page - 1)}
                disabled={result.page <= 1}
                data-testid="prev-page"
              >
                {content.common.previous}
              </button>
              <span data-testid="page-indicator">
                {content.catalog.page(result.page, totalPages || 1)}
              </span>
              <button
                type="button"
                onClick={() => goTo(result.page + 1)}
                disabled={result.page >= totalPages}
                data-testid="next-page"
              >
                {content.common.next}
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}


