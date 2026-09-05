import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useSiteContent, useSiteLanguage } from "../../app/providers";
import { productApi } from "./product-api";
import type { ProductListParams } from "./product-types";
import { AddToCartButton } from "../cart/AddToCartButton";
import { Seo } from "../../components/Seo";
import { FallbackImage } from "../../components/FallbackImage";
import "./catalog.css";

const SORT_VALUES = ["name-asc", "price-asc", "price-desc"] as const;

export function CatalogPage() {
  const content = useSiteContent();
  const { language } = useSiteLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");

  const requestedSort = searchParams.get("sort");
  const sort: ProductListParams["sort"] = SORT_VALUES.includes(
    requestedSort as (typeof SORT_VALUES)[number],
  ) ? requestedSort as ProductListParams["sort"] : "name-asc";

  const params: ProductListParams = {
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") || undefined,
    light: searchParams.get("light") || undefined,
    page: Number(searchParams.get("page") ?? 1) || 1,
    sort,
    lang: language,
  };

  const { data: filters, isPending: filtersPending } = useQuery({
    queryKey: ["catalog-filters", language],
    queryFn: () => productApi.filters(language),
  });

  const { data: result, isPending, isError, error } = useQuery({
    queryKey: ["products", params],
    queryFn: () => productApi.list(params),
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  });

  const totalPages = result?.totalPages ?? 0;

  function applyFilter(key: string, value: string) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      next.delete("page");
      return next;
    });
  }

  function clearFilters() {
    setSearchParams({});
    setSearchValue("");
  }

  function goTo(page: number) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("page", String(page));
      return next;
    });
  }

  function toggleSort(value: string) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("sort", value);
      next.delete("page");
      return next;
    });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (searchValue.trim()) next.set("q", searchValue.trim());
      else next.delete("q");
      next.delete("page");
      return next;
    });
  }

  const sortLabels = {
    "name-asc": content.catalog.sortNameAsc,
    "price-asc": content.catalog.sortPriceAsc,
    "price-desc": content.catalog.sortPriceDesc,
  } as const;

  return (
    <section className="catalog" data-testid="catalog-page">
      <Seo title={content.catalog.title} description={content.home.availability} path="/shop" />
      <h1 className="catalog__title">{content.catalog.title}</h1>

      <form className="catalog__search" onSubmit={submitSearch} role="search" data-testid="catalog-search">
        <label htmlFor="catalog-search-input" className="sr-only">{content.catalog.searchPlaceholder}</label>
        <input id="catalog-search-input" type="search" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder={content.catalog.searchPlaceholder} data-testid="search-input" />
        <button type="submit" data-testid="search-submit">{content.catalog.searchPlaceholder}</button>
      </form>

      <div className="catalog__filters" data-testid="catalog-filters">
        <label>
          {content.catalog.filterCategory}
          <select value={params.category ?? ""} onChange={(event) => event.target.value ? applyFilter("category", event.target.value) : setSearchParams((previous) => { const next = new URLSearchParams(previous); next.delete("category"); next.delete("page"); return next; })} data-testid="category-filter" disabled={filtersPending}>
            <option value="">{content.catalog.filterAllCategories}</option>
            {filters?.categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>

        <label>
          {content.catalog.filterLight}
          <select value={params.light ?? ""} onChange={(event) => event.target.value ? applyFilter("light", event.target.value) : setSearchParams((previous) => { const next = new URLSearchParams(previous); next.delete("light"); next.delete("page"); return next; })} data-testid="light-filter" disabled={filtersPending}>
            <option value="">{content.catalog.filterAllLights}</option>
            {filters?.lights.map((light) => <option key={light} value={light}>{light}</option>)}
          </select>
        </label>

        <label>
          {content.catalog.sortBy}
          <select value={sort} onChange={(event) => toggleSort(event.target.value)} data-testid="sort-select">
            {SORT_VALUES.map((value) => <option key={value} value={value}>{sortLabels[value]}</option>)}
          </select>
        </label>

        <button type="button" onClick={clearFilters} data-testid="clear-filters">
          {language === "ar" ? "مسح" : "Clear"}
        </button>
      </div>

      {isError ? (
        <p role="alert" data-testid="catalog-error">{content.catalog.loadError}: {(error as Error).message}</p>
      ) : (
        <>
          {isPending ? (
            <p data-testid="catalog-loading">{content.catalog.loading}</p>
          ) : !result || result.items.length === 0 ? (
            <p data-testid="catalog-empty">{content.catalog.noResults}</p>
          ) : (
            <ul className="catalog__grid" data-testid="product-grid" aria-label={content.catalog.title}>
              {result.items.map((product) => (
                <li key={product.id} className="product-card">
                  <FallbackImage src={product.image?.url ?? "/images/hero/leaf-1.svg"} alt={product.image?.altText ?? ""} className="product-card__image" loading="lazy" decoding="async" />
                  <h2 className="product-card__name">{product.name}</h2>
                  <p className="product-card__price">{product.priceQar} QAR</p>
                  <Link to={`/plants/${product.slug}`} className="product-card__link" data-testid={`view-${product.slug}`}>
                    {content.catalog.viewProduct(product.name)}
                  </Link>
                  <AddToCartButton product={product} className="product-card__cart" />
                </li>
              ))}
            </ul>
          )}

          {result && totalPages > 1 ? (
            <nav className="catalog__pagination" aria-label="Pagination" data-testid="pagination">
              <button type="button" onClick={() => goTo(result.page - 1)} disabled={result.page <= 1} data-testid="prev-page">{content.catalog.previous}</button>
              <span data-testid="page-indicator">{content.catalog.page(result.page, totalPages || 1)}</span>
              <button type="button" onClick={() => goTo(result.page + 1)} disabled={result.page >= totalPages} data-testid="next-page">{content.catalog.next}</button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
