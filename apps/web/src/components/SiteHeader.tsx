import { Link, NavLink, useLocation } from "react-router-dom";
import { LanguageToggle } from "./LanguageToggle";
import { content } from "../content/en";

const navLinks = [
  { to: "/shop", label: content.nav.shop },
  { to: "/cart", label: content.nav.cart },
] as const;

export function SiteHeader() {
  const { pathname } = useLocation();
  const onHome = pathname === "/";

  return (
    <header className={`site-header${onHome ? " site-header--hero" : ""}`} data-testid="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand" aria-label="QLeaves home">
          <img className="site-header__logo" src="/brand/qleaves-logo.png" alt="" aria-hidden="true" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          <span className="site-header__wordmark" aria-label={content.brand}>
            <span className="site-header__wordmark-q">Q</span>
            <span className="site-header__wordmark-leaves">LEAVES</span>
          </span>
        </Link>
        <div className="site-header__actions">
          <nav aria-label="primary" className="site-header__nav" data-testid="primary-nav">
            {navLinks.map(({ to, label }) => <NavLink key={to} to={to} className="nav-link">{label}</NavLink>)}
          </nav>
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
