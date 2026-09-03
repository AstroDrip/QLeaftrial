import { Link } from "react-router-dom";
import { content } from "../../../content/en";

export function ShopCtaSection() {
  return (
    <section className="shop-cta" data-testid="shop-cta">
      <h2 className="shop-cta__title home__featured">{content.nav.shop}</h2>
      <p className="shop-cta__message">Browse the full plant catalogue.</p>
      <Link to="/shop" className="shop-cta__link home__featured">
        Browse the catalogue
      </Link>
    </section>
  );
}
