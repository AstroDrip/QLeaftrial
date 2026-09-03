import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { productApi } from "./product-api";
import type { ProductListParams } from "./product-types";
import { content } from "../../content/en";
import "./catalog.css";

const SORT_OPTIONS: ReadonlyArray<{
  value: "name-asc" | "price-asc" | "price-desc";
  label: (c: typeof content) => string;
}> = [
  { value: "name-asc", label: (c) => c.catalog.sortNameAsc },
  { value: "price-asc", label: (c) => c.catalog.sortPriceAsc },
  { value: "price-desc", label: (c) => c.catalog.sortPriceDesc },
];

const MAX_PAGES = 20;

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(
    searchParams.get("q") ?? "",
  );

  const params: ProductListParams = {
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") || undefined,
    light: searchParams.get("light") || undefined,
    page: Number(searchParams.get("page") ?? 1) || 1,
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

  const sortedItems = useMemo(() => {
    if (!result) return [];
    const sort = searchParams.get("sort") ?? "name-asc";
    return [...result.items].sort((a, b) => {
      if (sort === "name-asc") return a.name.localeCompare(b.name);
      if (sort === "price-asc") return a.priceQar - b.priceQar;
      return b.priceQar - a.priceQar;
    });
  }, [result, searchParams]);

  const totalPages = Math.min(MAX_PAGES, 10);

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
          Search
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
                {cat}
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
                {light}
              </option>
            ))}
          </select>
        </label>

        <label>
          {content.catalog.sortBy}
          <select
            value={searchParams.get("sort") ?? "name-asc"}
            onChange={(e) => toggleSort(e.target.value)}
            data-testid="sort-select"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label(content)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={clearFilters}
          data-testid="clear-filters"
        >
          Clear
        </button>
      </div>

      {isError ? (
        <p role="alert" data-testid="catalog-error">
          {content.errors.retryFailed}: {(error as Error).message}
        </p>
      ) : (
        <>
          {isPending ? (
            <p data-testid="catalog-loading">Loading plants…</p>
          ) : sortedItems.length === 0 ? (
            <p data-testid="catalog-empty">
              {content.catalog.noResults}
            </p>
          ) : (
            <ul
              className="catalog__grid"
              data-testid="product-grid"
              aria-label={content.catalog.title}
            >
              {sortedItems.map((product) => (
                <li key={product.id} className="product-card">
                  <img
                    src={product.image?.url ?? "/images/hero/leaf-1.svg"}
                    alt={product.image?.altText ?? ""}
                    className="product-card__image"
                  />
                  <h2 className="product-card__name">{product.name}</h2>
                  <p className="product-card__price">
                    {product.priceQar} QAR
                  </p>
                  <Link
                    to={`/plants/${product.slug}`}
                    className="product-card__link"
                    data-testid={`view-${product.slug}`}
                  >
                    {content.catalog.viewProduct(product.name)}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {result && result.page > 1 && (
            <nav
              className="catalog__pagination"
              aria-label="Pagination"
              data-testid="pagination"
            >
              <button
                type="button"
                onClick={() => goTo(result.page - 1)}
                disabled={result.page <= 1}
                data-testid="prev-page"
              >
                Previous
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
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}


