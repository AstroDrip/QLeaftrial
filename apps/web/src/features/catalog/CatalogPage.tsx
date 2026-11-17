import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PLACEMENT_FILTERS, SIZE_FILTERS, inSize, placementValues } from "./product-size";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useSiteLanguage, useStoreSettings } from "../../app/providers";
import type { SiteLanguage } from "../../content/locales";
import { productApi } from "./product-api";
import type { ProductListParams } from "./product-types";
import { categoryCounts, useCatalogue } from "./catalogue-client";
import { catalogueListResponse } from "./catalogue-view";
import { localizeProduct } from "./localize-product";
import { ProductCard } from "./ProductCard";
import { Seo } from "../../components/Seo";
import "./catalog.css";
import { friendlyError } from "../../lib/friendly-error";
import { canonicalCategory, categoryName, orderedCategoryCounts } from "./shop-categories";

const SORT_OPTIONS = [
  { value: "relevance", label: "sortRelevance" },
  { value: "newest", label: "sortNewest" },
  { value: "featured", label: "sortFeatured" },
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

export const SLOW_LIST_MS = 4_000;

/** True once `active` has stayed true for SLOW_LIST_MS; false again as soon as it turns false. */
function useSlowPlaceholder(active: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) { setSlow(false); return; }
    const timer = window.setTimeout(() => setSlow(true), SLOW_LIST_MS);
    return () => window.clearTimeout(timer);
  }, [active]);
  return active && slow;
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
  const searching = Boolean(searchParams.get("q")?.trim());
  // Searching: best match first unless another order is chosen. Browsing: newest first.
  const defaultSort: ProductListParams["sort"] = searching ? "relevance" : "newest";
  const sort: ProductListParams["sort"] =
    SORT_OPTIONS.some((option) => option.value === requestedSort) && (orderingEnabled || !requestedSort?.startsWith("price")) && (searching || requestedSort !== "relevance")
      ? requestedSort as ProductListParams["sort"]
      : defaultSort;
  const priceRange = PRICE_RANGES.find((range) => range.value === searchParams.get("price"));
  // A link may use an older or display name ("Tabletop Plants"); it means the stored category.
  const requestedCategory = searchParams.get("category");
  const category = requestedCategory ? canonicalCategory(requestedCategory) : undefined;
  const light = searchParams.get("light") || undefined;
  const placement = PLACEMENT_FILTERS.find((value) => value === searchParams.get("placement"));
  const size = SIZE_FILTERS.find((value) => value === searchParams.get("size"));
  const inStock = searchParams.get("inStock") === "1";
  const page = Number(searchParams.get("page") ?? 1) || 1;

  const params: ProductListParams = {
    q: searchParams.get("q") ?? undefined,
    category,
    light,
    placement,
    size,
    minPrice: orderingEnabled ? priceRange?.min : undefined,
    maxPrice: orderingEnabled ? priceRange?.max : undefined,
    inStock: inStock ? "1" : undefined,
    page,
    sort,
    lang: language,
  };

  // Static-first: the saved catalogue answers this exact query at once (same filters, sort and page as
  // the API) while the live list loads, and stands in for it if the live list fails.
  const catalogue = useCatalogue();
  const paramsKey = JSON.stringify(params);
  const saved = useMemo(
    () => (catalogue.data ? catalogueListResponse(catalogue.data.products, params) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params is rebuilt every render; paramsKey is its value
    [catalogue.data, paramsKey],
  );

  const { data: filters, isPending: filtersPending } = useQuery({
    queryKey: ["catalog-filters"],
    queryFn: () => productApi.filters(),
    staleTime: 300_000,
  });

  const { data: result, isPending, isError, error, isPlaceholderData, refetch } = useQuery({
    queryKey: ["products", params],
    queryFn: () => productApi.list(params),
    placeholderData: (previous, previousQuery) =>
      saved ?? (previousQuery && queryLanguage(previousQuery.queryKey) === language ? previous : undefined),
    staleTime: 60_000,
  });

  // Without the live filter list the categories still come from the saved catalogue, with real counts.
  const savedCounts = useMemo(
    () => (catalogue.data ? Object.fromEntries(categoryCounts(catalogue.data.products).map((entry) => [entry.category, entry.count])) : {}),
    [catalogue.data],
  );
  const savedLabels = useMemo(
    () => (catalogue.data ? Object.fromEntries(categoryCounts(catalogue.data.products).filter((entry) => entry.categoryAr).map((entry) => [entry.category, entry.categoryAr!])) : {}),
    [catalogue.data],
  );
  const counts = filters?.categoryCounts ?? savedCounts;
  // Every category in the shop's order (lib/shop-categories.ts), including ones with no products yet.
  // (An older API without counts only sends names; those are listed too.)
  const listed = Object.keys(counts).length ? counts : Object.fromEntries((filters?.categories ?? []).map((name) => [name, 0]));
  const categories = orderedCategoryCounts(listed).map((entry) => entry.category);
  const categoryLabels = filters?.categoryLabels ?? savedLabels;
  // Where and size choices: only those that would find something (from the live filters, else the saved catalogue).
  const placements = filters?.placements ?? PLACEMENT_FILTERS.filter((value) => catalogue.data?.products.some((product) => product.placement && placementValues(value).includes(product.placement)));
  const sizes = filters?.sizes ?? SIZE_FILTERS.filter((value) => catalogue.data?.products.some((product) => product.heightCm != null && inSize(product.heightCm, value)));
  const sizeCopy = isArabic
    ? { place: "المكان", anyPlace: "أي مكان", size: "الارتفاع", anySize: "أي ارتفاع", placements: { indoor: "داخلي", outdoor: "خارجي" }, sizes: { small: "أقل من 50 سم", medium: "50–119 سم", large: "120 سم فأكثر" } }
    : { place: "Where", anyPlace: "Any place", size: "Height", anySize: "Any height", placements: { indoor: "Indoor", outdoor: "Outdoor" }, sizes: { small: "Under 50 cm", medium: "50–119 cm", large: "120 cm+" } };
  // When the live list fails, the saved catalogue is shown with a note instead of an error page. A live list that
  // has not answered after a few seconds gets the same note: the products on screen are the saved ones, and the
  // customer should know prices are confirmed at checkout. (Not sooner, so the note does not flash on a normal load.)
  const waitingTooLong = useSlowPlaceholder(isPlaceholderData && Boolean(saved));
  const showingSaved = (isError || waitingTooLong) && Boolean(saved);
  const shown = isError && saved ? saved : result;
  const totalCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const label = (value: string, labels?: Record<string, string>) => categoryName(value, isArabic ? "ar" : "en", labels?.[value]);
  const totalPages = shown?.totalPages ?? 0;

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
    placement ? { key: "placement", text: sizeCopy.placements[placement] } : null,
    size ? { key: "size", text: `${sizeCopy.size}: ${sizeCopy.sizes[size]}` } : null,
    priceRange && orderingEnabled ? { key: "price", text: `${priceRange.min}${priceRange.max ? `–${priceRange.max}` : "+"} QAR` } : null,
    params.inStock ? { key: "inStock", text: t.inStockOnly } : null,
  ].filter((filter): filter is { key: string; text: string } => Boolean(filter));

  const heading = category ? label(category, categoryLabels) : t.title;

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
          <strong>{category ? label(category, categoryLabels) : t.filterAllCategories}</strong>
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
              <button type="button" aria-pressed={category === value} disabled={filtersPending && !catalogue.data} onClick={() => { update({ category: value }); setCategoriesOpen(false); }}>
                <span>{label(value, categoryLabels)}</span>
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
          {placements.length || placement ? (
            <label>
              <span>{sizeCopy.place}</span>
              <select value={placement ?? ""} onChange={(event) => update({ placement: event.target.value || undefined })} data-testid="placement-filter">
                <option value="">{sizeCopy.anyPlace}</option>
                {placements.map((value) => <option key={value} value={value}>{sizeCopy.placements[value]}</option>)}
              </select>
            </label>
          ) : null}
          {sizes.length || size ? (
            <label>
              <span>{sizeCopy.size}</span>
              <select value={size ?? ""} onChange={(event) => update({ size: event.target.value || undefined })} data-testid="size-filter">
                <option value="">{sizeCopy.anySize}</option>
                {sizes.map((value) => <option key={value} value={value}>{sizeCopy.sizes[value]}</option>)}
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
            <select value={sort} onChange={(event) => update({ sort: event.target.value === defaultSort ? undefined : event.target.value })} data-testid="sort-select">
              {SORT_OPTIONS.filter((option) => (orderingEnabled || !option.value.startsWith("price")) && (searching || option.value !== "relevance")).map((option) => (
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
          <p aria-live="polite">{shown ? t.resultCount(shown.totalItems) : ""}</p>
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

        {showingSaved ? (
          <div className="catalog__saved" data-testid="catalog-saved" role="status">
            <p>{isArabic ? "نعرض آخر نسخة محفوظة من المتجر. تُؤكَّد الأسعار والتوفر عند إتمام الطلب." : "Showing the latest saved catalogue. Prices and availability are confirmed at checkout."}</p>
            <button type="button" className="button button--secondary" onClick={() => refetch()} data-testid="catalog-retry">{content.errors.retry}</button>
          </div>
        ) : null}

        {isError && !showingSaved ? (
          <div className="catalog__error" data-testid="catalog-error">
            <p role="alert">
              {friendlyError(error, language)}
            </p>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => refetch()}
              data-testid="catalog-retry"
            >
              {content.errors.retry}
            </button>
          </div>
        ) : isPending && !shown ? (
          <p data-testid="catalog-loading" role="status">{isArabic ? "جارٍ تحميل النباتات…" : "Loading plants…"}</p>
        ) : !shown || shown.items.length === 0 ? (
          <div className="catalog__empty" data-testid="catalog-empty">
            <p>{t.noResults}</p>
            <button type="button" className="button button--secondary" onClick={() => setSearchParams({})}>{t.showAll}</button>
          </div>
        ) : (
          <ul className="product-grid" data-testid="product-grid" aria-label={heading} aria-busy={isPlaceholderData}>
            {shown.items.map((product, index) => (
              <ProductCard key={product.id} product={product} orderingEnabled={orderingEnabled} eager={index < 4} />
            ))}
          </ul>
        )}

        {shown && totalPages > 1 ? (
          <nav className="catalog__pagination" aria-label={content.aria.pagination} data-testid="pagination">
            <button type="button" className="button button--secondary" onClick={() => goTo(shown.page - 1)} disabled={shown.page <= 1} data-testid="prev-page">{content.common.previous}</button>
            <ol>
              {pageWindow(shown.page, totalPages).map((page, index) => page === "gap"
                ? <li key={`gap-${index}`} aria-hidden="true">…</li>
                : <li key={page}><button type="button" aria-current={page === shown.page ? "page" : undefined} onClick={() => goTo(page)}>{page}</button></li>)}
            </ol>
            <span className="sr-only" data-testid="page-indicator">{t.page(shown.page, totalPages)}</span>
            <button type="button" className="button button--secondary" onClick={() => goTo(shown.page + 1)} disabled={shown.page >= totalPages} data-testid="next-page">{content.common.next}</button>
          </nav>
        ) : null}
      </div>
    </section>
  );
}
