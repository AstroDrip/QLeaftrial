import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useSiteLanguage, useStoreSettings } from "../../app/providers";
import type { SiteLanguage } from "../../content/locales";
import { productApi } from "./product-api";
import type { ProductListParams } from "./product-types";
import { ProductCard } from "./ProductCard";
import { Seo } from "../../components/Seo";
import "./catalog.css";

const SORT_OPTIONS = [
  { value: "newest", label: "sortNewest" },
  { value: "name-asc", label: "sortNameAsc" },
  { value: "price-asc", label: "sortPriceAsc" },
  { value: "price-desc", label: "sortPriceDesc" },
] as const;

const PRICE_RANGES = [
  { value: "0-50", min: 0, max: 50 },
  { value: "50-100", min: 50, max: 100 },
  { value: "100-200", min: 100, max: 200 },
  { value: "200-", min: 200, max: undefined },
] as const;

function queryLanguage(queryKey: readonly unknown[]): SiteLanguage | null {
  const params = queryKey[1];
  if (typeof params !== "object" || params === null || !("lang" in params)) return null;
  return params.lang === "en" || params.lang === "ar" ? params.lang : null;
}

// Page buttons around the current page, with gaps for long catalogues.
function pageWindow(current: number, total: number): Array<number | "gap"> {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1] > 1 ? ["gap" as const, page] : [page]));
}

export function CatalogPage() {
  const { content, language, isArabic } = useSiteLanguage();
  const settings = useStoreSettings();
  const orderingEnabled = settings.data?.orderingEnabled ?? true;
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchValue, setSearchValue] = useState(searchParams.get("q") ?? "");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const t = content.catalog;

  useEffect(() => { setSearchValue(searchParams.get("q") ?? ""); }, [searchParams]);

  const requestedSort = searchParams.get("sort");
  const sort: ProductListParams["sort"] =
    SORT_OPTIONS.some((option) => option.value === requestedSort) && (orderingEnabled || !requestedSort?.startsWith("price"))
      ? requestedSort as ProductListParams["sort"]
      : "newest";
  const priceRange = PRICE_RANGES.find((range) => range.value === searchParams.get("price"));
  const category = searchParams.get("category") || undefined;

  const params: ProductListParams = {
    q: searchParams.get("q") ?? undefined,
    category,
    light: searchParams.get("light") || undefined,
    minPrice: orderingEnabled ? priceRange?.min : undefined,
    maxPrice: orderingEnabled ? priceRange?.max : undefined,
    inStock: searchParams.get("inStock") === "1" ? "1" : undefined,
    page: Number(searchParams.get("page") ?? 1) || 1,
    sort,
    lang: language,
  };

  const { data: filters, isPending: filtersPending } = useQuery({
    queryKey: ["catalog-filters"],
    queryFn: () => productApi.filters(),
    staleTime: 300_000,
  });

  const { data: result, isPending, isError, error, isPlaceholderData } = useQuery({
    queryKey: ["products", params],
    queryFn: () => productApi.list(params),
    placeholderData: (previous, previousQuery) =>
      previousQuery && queryLanguage(previousQuery.queryKey) === language ? previous : undefined,
    staleTime: 60_000,
  });

  const counts = filters?.categoryCounts ?? {};
  const categories = filters?.categoryCounts ? Object.keys(counts).sort() : filters?.categories ?? [];
  const totalCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const label = (value: string, labels?: Record<string, string>) => (isArabic ? labels?.[value] || value : value);
  const totalPages = result?.totalPages ?? 0;

  function update(changes: Record<string, string | undefined>, keepPage = false) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value); else next.delete(key);
      }
      if (!keepPage) next.delete("page");
      return next;
    });
  }

  function goTo(page: number) {
    update({ page: page > 1 ? String(page) : undefined }, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update({ q: searchValue.trim() || undefined });
  }

  const activeFilters = [
    params.q ? { key: "q", text: `“${params.q}”` } : null,
    params.light ? { key: "light", text: label(params.light, filters?.lightLabels) } : null,
    priceRange && orderingEnabled ? { key: "price", text: `${priceRange.min}${priceRange.max ? `–${priceRange.max}` : "+"} QAR` } : null,
    params.inStock ? { key: "inStock", text: t.inStockOnly } : null,
  ].filter((filter): filter is { key: string; text: string } => Boolean(filter));

  const heading = category ? label(category, filters?.categoryLabels) : t.title;

  return (
    <section className="catalog container" data-testid="catalog-page">
      <Seo
        title={heading}
        description={isArabic ? "تسوق نباتات QLeaves الداخلية والخارجية ومستلزماتها مع التوصيل داخل قطر." : "Shop QLeaves indoor and outdoor plants and plant care essentials, delivered across Qatar."}
        path={category ? `/shop?category=${encodeURIComponent(category)}` : "/shop"}
      />

      <aside className={`catalog__sidebar${categoriesOpen ? " is-open" : ""}`} aria-label={t.filterCategory}>
        <h2 className="catalog__sidebar-title">{t.filterCategory}</h2>
        {/* Phones: one clear control that opens the category list instead of a hidden sideways scroll. */}
        <button type="button" className="catalog__category-toggle" aria-expanded={categoriesOpen} aria-controls="catalog-categories" onClick={() => setCategoriesOpen((open) => !open)}>
          <span className="catalog__category-toggle-label">{t.filterCategory}</span>
          <strong>{category ? label(category, filters?.categoryLabels) : t.filterAllCategories}</strong>
          <span className="catalog__count">{category ? counts[category] ?? "" : totalCount || ""}</span>
          <span className="catalog__chevron" aria-hidden="true" />
        </button>
        <ul id="catalog-categories" className="catalog__categories" data-testid="category-filter">
          <li>
            <button type="button" aria-pressed={!category} onClick={() => { update({ category: undefined }); setCategoriesOpen(false); }}>
              <span>{t.filterAllCategories}</span>
              {totalCount ? <span className="catalog__count">{totalCount}</span> : null}
            </button>
          </li>
          {categories.map((value) => (
            <li key={value}>
              <button type="button" aria-pressed={category === value} disabled={filtersPending} onClick={() => { update({ category: value }); setCategoriesOpen(false); }}>
                <span>{label(value, filters?.categoryLabels)}</span>
                {counts[value] ? <span className="catalog__count">{counts[value]}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="catalog__main">
        <header className="catalog__header">
          <div>
            <p className="eyebrow">{t.collection}</p>
            <h1 className="catalog__title">{heading}</h1>
          </div>
          <form className="catalog__search" onSubmit={submitSearch} role="search" data-testid="catalog-search">
            <label htmlFor="catalog-search-input" className="sr-only">{t.searchPlaceholder}</label>
            <input id="catalog-search-input" type="search" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder={t.searchPlaceholder} data-testid="search-input" />
            <button type="submit" className="button" data-testid="search-submit">{content.common.search}</button>
          </form>
        </header>

        <div className="catalog__toolbar" data-testid="catalog-filters">
          {filtersPending || filters?.lights.length ? (
            <label>
              <span>{t.filterLight}</span>
              <select value={params.light ?? ""} onChange={(event) => update({ light: event.target.value || undefined })} data-testid="light-filter" disabled={filtersPending}>
                <option value="">{t.filterAllLights}</option>
                {filters?.lights.map((light) => <option key={light} value={light}>{label(light, filters.lightLabels)}</option>)}
              </select>
            </label>
          ) : null}
          {orderingEnabled ? (
            <label>
              <span>{t.filterPrice}</span>
              <select value={priceRange?.value ?? ""} onChange={(event) => update({ price: event.target.value || undefined })} data-testid="price-filter">
                <option value="">{t.filterAnyPrice}</option>
                {PRICE_RANGES.map((range) => <option key={range.value} value={range.value}>{range.max ? `${range.min}–${range.max} QAR` : `${range.min}+ QAR`}</option>)}
              </select>
            </label>
          ) : null}
          <label>
            <span>{t.sortBy}</span>
            <select value={sort} onChange={(event) => update({ sort: event.target.value === "newest" ? undefined : event.target.value })} data-testid="sort-select">
              {SORT_OPTIONS.filter((option) => orderingEnabled || !option.value.startsWith("price")).map((option) => (
                <option key={option.value} value={option.value}>{t[option.label]}</option>
              ))}
            </select>
          </label>
          <label className="catalog__check">
            <input type="checkbox" checked={Boolean(params.inStock)} onChange={(event) => update({ inStock: event.target.checked ? "1" : undefined })} data-testid="in-stock-filter" />
            <span>{t.inStockOnly}</span>
          </label>
        </div>

        <div className="catalog__status">
          <p aria-live="polite">{result ? t.resultCount(result.totalItems) : ""}</p>
          {activeFilters.length ? (
            <ul className="catalog__chips">
              {activeFilters.map((filter) => (
                <li key={filter.key}>
                  <button type="button" onClick={() => update({ [filter.key]: undefined })} aria-label={`${t.removeFilter}: ${filter.text}`}>
                    {filter.text} <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
              <li><button type="button" className="catalog__clear" onClick={() => setSearchParams(category ? { category } : {})} data-testid="clear-filters">{content.common.clear}</button></li>
            </ul>
          ) : null}
        </div>

        {isError ? (
          <p role="alert" data-testid="catalog-error">
            {content.errors.retryFailed}{isArabic ? "" : `: ${(error as Error).message}`}
          </p>
        ) : isPending ? (
          <p data-testid="catalog-loading" role="status">{isArabic ? "جارٍ تحميل النباتات…" : "Loading plants…"}</p>
        ) : !result || result.items.length === 0 ? (
          <div className="catalog__empty" data-testid="catalog-empty">
            <p>{t.noResults}</p>
            <button type="button" className="button button--secondary" onClick={() => setSearchParams({})}>{t.showAll}</button>
          </div>
        ) : (
          <ul className="product-grid" data-testid="product-grid" aria-label={heading} aria-busy={isPlaceholderData}>
            {result.items.map((product, index) => (
              <ProductCard key={product.id} product={product} orderingEnabled={orderingEnabled} eager={index < 4} />
            ))}
          </ul>
        )}

        {result && totalPages > 1 ? (
          <nav className="catalog__pagination" aria-label={content.aria.pagination} data-testid="pagination">
            <button type="button" className="button button--secondary" onClick={() => goTo(result.page - 1)} disabled={result.page <= 1} data-testid="prev-page">{content.common.previous}</button>
            <ol>
              {pageWindow(result.page, totalPages).map((page, index) => page === "gap"
                ? <li key={`gap-${index}`} aria-hidden="true">…</li>
                : <li key={page}><button type="button" aria-current={page === result.page ? "page" : undefined} onClick={() => goTo(page)}>{page}</button></li>)}
            </ol>
            <span className="sr-only" data-testid="page-indicator">{t.page(result.page, totalPages)}</span>
            <button type="button" className="button button--secondary" onClick={() => goTo(result.page + 1)} disabled={result.page >= totalPages} data-testid="next-page">{content.common.next}</button>
          </nav>
        ) : null}
      </div>
    </section>
  );
}
