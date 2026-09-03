import { Link, NavLink } from "react-router-dom";
import { content } from "../content/en";

const navLinks: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/shop", label: content.nav.shop },
  { to: "/cart", label: content.nav.cart },
];

export function SiteHeader() {
  return (
    <header className="site-header" data-testid="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand" aria-label="QLeaves home">
          <span className="site-header__wordmark">{content.brand}</span>
          <span className="site-header__tagline sr-only">{content.tagline}</span>
        </Link>

        <nav aria-label="primary" className="site-header__nav" data-testid="primary-nav">
          {navLinks.map(({ to, label }) => (
            <NavLink key={to} to={to} className="nav-link">
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
