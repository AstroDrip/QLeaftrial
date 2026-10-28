import { Link, NavLink } from "react-router-dom";
import { LanguageToggle } from "./LanguageToggle";
import { HeaderSearch } from "./HeaderSearch";
import { BagIcon } from "./icons";
import { useSiteLanguage, useStoreSettings } from "../app/providers";
import { useCartStore } from "../features/cart/cart-store";
import { prefetchRoute } from "../app/route-modules";

export function SiteHeader() {
  const { content, isArabic } = useSiteLanguage();
  const settings = useStoreSettings();
  const orderingEnabled = settings.data?.orderingEnabled ?? true;
  const cartCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const navLinks = [
    { to: "/shop", label: content.nav.shop },
    { to: "/about", label: content.nav.about },
  ];
  const cartLabel = isArabic ? `السلة، ${cartCount} منتجات` : `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`;

  return (
    <header className="site-header" data-testid="site-header">
      <div className="container site-header__inner">
        <Link to="/" className="site-header__brand" aria-label="QLeaves home" lang="en" dir="ltr">
          <img className="site-header__logo" src="/brand/qleaves-logo.png" alt="" aria-hidden="true" width={34} height={34} onError={(event) => { event.currentTarget.style.display = "none"; }} />
          <span className="site-header__wordmark" aria-label={content.brand}>
            <span className="site-header__wordmark-q">Q</span>
            <span className="site-header__wordmark-leaves">LEAVES</span>
          </span>
        </Link>
        <nav aria-label={content.aria.primaryNavigation} className="site-header__nav" data-testid="primary-nav">
          {navLinks.map(({ to, label }) => (
            <NavLink key={to} to={to} className="nav-link" onMouseEnter={() => prefetchRoute(to)} onFocus={() => prefetchRoute(to)}>{label}</NavLink>
          ))}
        </nav>
        <div className="site-header__actions">
          <HeaderSearch />
          <LanguageToggle />
          {orderingEnabled ? (
            <Link to="/cart" className="icon-button" aria-label={cartLabel} onMouseEnter={() => prefetchRoute("/cart")}>
              <BagIcon />
              {cartCount > 0 ? <span className="icon-button__badge" aria-hidden="true">{cartCount > 99 ? "99+" : cartCount}</span> : null}
            </Link>
          ) : null}
        </div>
      </div>
      {settings.isError ? <p className="site-header__alert" role="alert">{isArabic ? "تعذر التحقق من حالة الطلبات." : "Ordering status could not be checked."}</p> : null}
    </header>
  );
}
