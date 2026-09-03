import { Link } from "react-router-dom";
import { content } from "../../../content/en";

export function HeroSection() {
  return (
    <section className="hero-section" data-testid="hero-section">
      <div className="hero-section__wordmark home__wordmark" data-testid="wordmark">
        {content.brand}
      </div>
      <h1 className="hero-section__headline home__headline" data-testid="hero-headline">
        {content.home.heroTitle}
      </h1>
      <p className="hero-section__subhead home__subhead" data-testid="hero-subhead">
        {content.home.heroSubtitle}
      </p>
      <Link
        to="/shop"
        className="hero-section__cta home__cta"
        data-testid="hero-cta"
      >
        {content.home.shopCta}
      </Link>
    </section>
  );
}
