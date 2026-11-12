import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useSiteLanguage } from "../app/providers";
import { prefetchRoute } from "../app/route-modules";
import type { ShopCategory } from "../features/catalog/use-shop-categories";

// Desktop: "Shop" stays an ordinary link; the chevron beside it opens the categories underneath, so
// every category is one step away. Opens on hover (with a short grace period) or by click or keyboard;
// Escape, a click elsewhere or choosing a link closes it. The panel sits below its own button and
// never covers it or the other header controls.
export function ShopMenu({ label, categories }: { label: string; categories: ShopCategory[] }) {
  const { isArabic } = useSiteLanguage();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef(0);
  // A mouse that hovered the menu open has already "opened" it; its click should not shut it again.
  const openedByHover = useRef(false);
  const panelId = useId();

  useEffect(() => { setOpen(false); }, [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const hover = (next: boolean) => (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(closeTimer.current);
    if (next) {
      if (!open) openedByHover.current = true;
      setOpen(true);
    } else closeTimer.current = window.setTimeout(() => { openedByHover.current = false; setOpen(false); }, 180);
  };

  return (
    <div className="shop-menu" ref={root} onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
      <NavLink to="/shop" className="nav-link" onMouseEnter={() => prefetchRoute("/shop")} onFocus={() => prefetchRoute("/shop")}>{label}</NavLink>
      {categories.length ? (
        <>
          <button
            ref={button}
            type="button"
            className="shop-menu__toggle"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={isArabic ? "فئات المتجر" : "Shop categories"}
            onClick={() => {
              if (openedByHover.current) { openedByHover.current = false; setOpen(true); return; }
              setOpen((current) => !current);
            }}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>
          </button>
          <div id={panelId} className="shop-menu__panel" data-open={open ? "true" : "false"} hidden={!open}>
            <ul>
              {categories.map((category) => (
                <li key={category.category}>
                  <Link to={category.to} onClick={() => setOpen(false)} onMouseEnter={() => prefetchRoute("/shop")}>
                    <span>{category.label}</span>
                    <span className="shop-menu__count">{category.count || (isArabic ? "قريبًا" : "Soon")}</span>
                  </Link>
                </li>
              ))}
              <li className="shop-menu__all">
                <Link to="/shop" onClick={() => setOpen(false)}>{isArabic ? "كل المنتجات" : "All products"}</Link>
              </li>
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
