import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LanguageToggle } from "./LanguageToggle";
import { HeaderSearch } from "./HeaderSearch";
import { BagIcon } from "./icons";
import { LeafMenuIcon } from "./LeafMenuIcon";
import { useSiteLanguage, useStoreSettings } from "../app/providers";
import { useCartStore } from "../features/cart/cart-store";
import { useFreeDeliveryController } from "../features/cart/free-delivery-store";
import { prefetchRoute } from "../app/route-modules";

// The inline links only fit on wide screens; below this the centred menu takes over.
const MENU_MAX = 960;
// On narrow phones the language switch moves into the menu so the logo, menu button, search and cart all fit.
const COMPACT_MAX = 480;
const CART_GAP = 12;
// The panel starts exactly at the header's bottom edge: its sheet unrolls from there.
const PANEL_OVERLAP = 0;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches));
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function SiteHeader() {
  const { content, isArabic } = useSiteLanguage();
  const settings = useStoreSettings();
  const orderingEnabled = settings.data?.orderingEnabled ?? true;
  useFreeDeliveryController();
  const { pathname } = useLocation();
  const cartCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const menuMode = useMediaQuery(`(max-width: ${MENU_MAX}px)`);
  const compact = useMediaQuery(`(max-width: ${COMPACT_MAX}px)`);
  const [menuOpen, setMenuOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const cart = useRef<HTMLAnchorElement>(null);
  const [cartShift, setCartShift] = useState<{ x: number; y: number } | null>(null);

  const t = content.nav;
  const navLinks = [
    { to: "/shop", label: t.shop },
    { to: "/about", label: t.about },
  ];
  const cartLabel = isArabic ? `السلة، ${cartCount} منتجات` : `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`;
  const open = menuOpen && menuMode;

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) menuButton.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => { if (!menuMode) setMenuOpen(false); }, [menuMode]);

  // The one cart button glides from the header to just under the opened menu, centred beneath it, and back.
  // The target is measured from the real layout (the cart's resting box and the panel's height), never guessed.
  useLayoutEffect(() => {
    if (!open) { setCartShift(null); return; }
    const place = () => {
      const bar = header.current;
      const link = cart.current;
      const sheet = panel.current;
      if (!bar || !link || !sheet) return;
      // offsetLeft/offsetTop ignore the transform, so these are always the cart's resting place in the header.
      const barBox = bar.getBoundingClientRect();
      const homeLeft = barBox.left + link.offsetLeft;
      const homeTop = barBox.top + link.offsetTop;
      const sheetBottom = barBox.bottom - PANEL_OVERLAP + sheet.offsetHeight;
      const viewport = document.documentElement.clientWidth;
      setCartShift({
        x: Math.round(viewport / 2 - (homeLeft + link.offsetWidth / 2)),
        y: Math.round(sheetBottom + CART_GAP - homeTop),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, compact, isArabic]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (header.current?.contains(target) && (panel.current?.contains(target) || menuButton.current?.contains(target) || cart.current?.contains(target))) return;
      closeMenu();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(true); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, closeMenu]);

  function toggleMenu() {
    if (open) { closeMenu(); return; }
    setMenuOpen(true);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true }));
  }

  return (
    <header
      ref={header}
      className={`site-header${open ? " site-header--menu-open" : ""}`}
      data-testid="site-header"
      style={cartShift ? ({ "--cart-dx": `${cartShift.x}px`, "--cart-dy": `${cartShift.y}px` } as CSSProperties) : undefined}
    >
      <div className="container site-header__inner">
        {/* On phones and tablets the leaf menu comes first, then the logo (it is hidden on wide screens, where
            the inline links take over), so keyboard order matches what is on screen. */}
        <button
          ref={menuButton}
          type="button"
          className={`site-header__menu icon-button${open ? " is-open" : ""}`}
          aria-label={open ? t.closeMenu : t.openMenu}
          aria-expanded={open}
          aria-controls="site-menu"
          onClick={toggleMenu}
        >
          <LeafMenuIcon open={open} />
        </button>
        <Link to="/" className="site-header__brand" aria-label="QLeaves home" lang="en" dir="ltr">
          {/* The brand kit's own artwork, never retyped: the full logo, reversed for the dark header. */}
          <span className="site-header__logo" role="img" aria-label={content.brand}>
            <img className="site-header__logo-full" src="/brand/qleaves-logo-white.png" alt="" aria-hidden="true" width={140} height={49} />
          </span>
        </Link>
        <nav aria-label={content.aria.primaryNavigation} className="site-header__nav" data-testid="primary-nav">
          {navLinks.map(({ to, label }) => (
            <NavLink key={to} to={to} className="nav-link" onMouseEnter={() => prefetchRoute(to)} onFocus={() => prefetchRoute(to)}>{label}</NavLink>
          ))}
        </nav>
        <div className="site-header__actions">
          <HeaderSearch />
          {!compact ? <LanguageToggle /> : null}
          {/* The cart button is the way to the cart, so it is not shown on the cart page itself. */}
          {orderingEnabled && pathname !== "/cart" ? (
            <Link ref={cart} to="/cart" className="icon-button site-header__cart" aria-label={cartLabel} onMouseEnter={() => prefetchRoute("/cart")}>
              <BagIcon />
              {cartCount > 0 ? <span className="icon-button__badge" aria-hidden="true">{cartCount > 99 ? "99+" : cartCount}</span> : null}
            </Link>
          ) : null}
        </div>
      </div>

      <nav
        ref={panel}
        id="site-menu"
        className="site-menu"
        aria-label={t.menu}
        aria-hidden={open ? undefined : true}
        inert={!open}
        data-open={open ? "true" : "false"}
      >
        <ul>
          <li><NavLink to="/" end className="site-menu__link" onMouseEnter={() => prefetchRoute("/")}>{t.home}</NavLink></li>
          <li><NavLink to="/shop" className="site-menu__link" onMouseEnter={() => prefetchRoute("/shop")}>{t.shop}</NavLink></li>
          <li><NavLink to="/about" className="site-menu__link" onMouseEnter={() => prefetchRoute("/about")}>{t.about}</NavLink></li>
        </ul>
        {compact ? (
          <div className="site-menu__language">
            <span>{t.language}</span>
            <LanguageToggle />
          </div>
        ) : null}
      </nav>
    </header>
  );
}
