import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSiteLanguage } from "../app/providers";
import { productApi } from "../features/catalog/product-api";
import { localizeProduct } from "../features/catalog/localize-product";
import { CloseIcon, SearchIcon } from "./icons";

const SUGGESTION_LIMIT = 5;

function useDebounced(value: string, delay = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function HeaderSearch() {
  const { language, isArabic } = useSiteLanguage();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = useDebounced(term.trim());

  const suggestions = useQuery({
    queryKey: ["products", "suggest", query, language],
    queryFn: () => productApi.list({ q: query, page: 1, lang: language }),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
  const items = (suggestions.data?.items ?? []).slice(0, SUGGESTION_LIMIT);
  const showResults = open && query.length >= 2 && !suggestions.isPending;

  useEffect(() => { setOpen(false); setMobileOpen(false); }, [pathname]);
  useEffect(() => { setActive(-1); }, [query]);
  useEffect(() => {
    if (!open && !mobileOpen) return;
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) { setOpen(false); setMobileOpen(false); }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, mobileOpen]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = term.trim();
    if (active >= 0 && items[active]) {
      navigate(`/plants/${items[active].slug}`);
    } else {
      navigate(value ? `/shop?q=${encodeURIComponent(value)}` : "/shop");
    }
    setOpen(false);
    input.current?.blur();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { setOpen(false); setMobileOpen(false); return; }
    if (!showResults || items.length === 0) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % items.length); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index - 1 + items.length) % items.length); }
  }

  const label = isArabic ? "ابحث عن نبات" : "Search plants";
  return (
    <div ref={container} className={`header-search${mobileOpen ? " header-search--open" : ""}`}>
      <button
        type="button"
        className="icon-button header-search__toggle"
        aria-label={mobileOpen ? (isArabic ? "إغلاق البحث" : "Close search") : label}
        aria-expanded={mobileOpen}
        onClick={() => {
          setMobileOpen((current) => !current);
          requestAnimationFrame(() => input.current?.focus());
        }}
      >
        {mobileOpen ? <CloseIcon /> : <SearchIcon />}
      </button>
      <form className="header-search__form" role="search" onSubmit={submit}>
        <SearchIcon />
        <input
          ref={input}
          type="search"
          value={term}
          placeholder={label}
          aria-label={label}
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          enterKeyHint="search"
          onChange={(event) => { setTerm(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </form>
      {showResults ? (
        <ul id={listId} className="header-search__results" role="listbox" aria-label={label}>
          {items.length === 0 ? (
            <li className="header-search__empty">{isArabic ? "لا توجد نباتات مطابقة" : "No plants match your search"}</li>
          ) : items.map((product, index) => {
            const localized = localizeProduct(product, isArabic);
            return (
              <li key={product.id} role="option" id={`${listId}-${index}`} aria-selected={index === active}>
                <Link to={`/plants/${product.slug}`} aria-selected={index === active} tabIndex={-1}>
                  <img src={product.image?.url ?? "/images/hero/leaf-1.svg"} alt="" loading="lazy" width={44} height={44} />
                  <span>{localized.name}</span>
                  <span>{product.priceQar} QAR</span>
                </Link>
              </li>
            );
          })}
          {items.length > 0 ? (
            <li>
              <Link className="header-search__all" to={`/shop?q=${encodeURIComponent(query)}`} tabIndex={-1}>
                {isArabic ? `عرض كل النتائج (${suggestions.data?.totalItems ?? 0})` : `See all results (${suggestions.data?.totalItems ?? 0})`}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
