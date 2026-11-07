import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSiteLanguage } from "../app/providers";
import { productApi } from "../features/catalog/product-api";
import { localizeProduct } from "../features/catalog/localize-product";
import { CloseIcon, SearchIcon } from "./icons";

const SUGGESTION_LIMIT = 5;
const EDGE_GAP = 16;
const OBSTACLE_GAP = 12;
const PHONE_MAX = 720;
const MIN_WIDTH = 180;
const MAX_WIDTH = 300;

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
  const [expanded, setExpanded] = useState(false);
  const [expandedWidth, setExpandedWidth] = useState(MAX_WIDTH);
  const [active, setActive] = useState(-1);
  const query = useDebounced(term.trim());

  const suggestions = useQuery({
    queryKey: ["products", "suggest", query, language],
    queryFn: () => productApi.list({ q: query, page: 1, lang: language }),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
  const items = (suggestions.data?.items ?? []).slice(0, SUGGESTION_LIMIT);
  const showResults = expanded && open && query.length >= 2 && !suggestions.isPending;

  useEffect(() => { setOpen(false); setExpanded(false); }, [pathname]);
  useEffect(() => { setActive(-1); }, [query]);
  // The capsule grows away from the icon, so it may only use the free space on that side: it stops
  // short of the logo and any visible navigation instead of covering them.
  useEffect(() => {
    if (!expanded) return;
    const measure = () => {
      const rect = container.current?.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      if (!rect) return;
      let edge = isArabic ? viewport - EDGE_GAP : EDGE_GAP;
      // On phones the logo and menu button step aside for the open capsule (see the header CSS), so only wider screens keep them as obstacles.
      container.current?.closest(".site-header__inner")?.querySelectorAll<HTMLElement>(".site-header__brand, .site-header__nav, .site-header__menu").forEach((element) => {
        if (!element.offsetWidth || viewport <= PHONE_MAX) return;
        const box = element.getBoundingClientRect();
        edge = isArabic ? Math.min(edge, box.left - OBSTACLE_GAP) : Math.max(edge, box.right + OBSTACLE_GAP);
      });
      const room = isArabic ? edge - rect.left : rect.right - edge;
      // On phones the capsule takes all the free space; on wider screens it stays a modest search field.
      const preferred = viewport <= PHONE_MAX ? MAX_WIDTH : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, viewport * 0.22));
      setExpandedWidth(Math.max(rect.width, Math.min(preferred, room)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [expanded, isArabic]);

  useEffect(() => {
    if (!expanded) return;
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) { setOpen(false); setExpanded(false); }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [expanded]);

  function toggle() {
    if (expanded) {
      setOpen(false);
      setExpanded(false);
      return;
    }
    setExpanded(true);
    // The input only becomes focusable once the open class has been applied.
    requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
  }

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
    if (event.key === "Escape") { setOpen(false); setExpanded(false); container.current?.querySelector<HTMLButtonElement>(".header-search__toggle")?.focus(); return; }
    if (!showResults || items.length === 0) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % items.length); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index - 1 + items.length) % items.length); }
  }

  const label = isArabic ? "ابحث عن نبات" : "Search plants";
  return (
    <div
      ref={container}
      className={`header-search${expanded ? " header-search--open" : ""}`}
      style={{ "--search-open-width": `${expandedWidth}px` } as CSSProperties}
      // Only a keyboard move to another element closes it. A null target (a mouse press on a
      // suggestion in Safari, or switching windows) must not, or the click would be lost.
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (expanded && next && !event.currentTarget.contains(next)) { setOpen(false); if (!term.trim()) setExpanded(false); }
      }}
    >
      <form className="header-search__form" role="search" onSubmit={submit}>
        <button
          type="button"
          className="icon-button header-search__toggle"
          aria-label={expanded ? (isArabic ? "إغلاق البحث" : "Close search") : label}
          aria-expanded={expanded}
          onClick={toggle}
        >
          <SearchIcon className="header-search__glyph header-search__glyph--search" />
          <CloseIcon className="header-search__glyph header-search__glyph--close" />
        </button>
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
          tabIndex={expanded ? 0 : -1}
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
