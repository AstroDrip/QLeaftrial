import "./home.css";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { content } from "../../content/en";
import { useHeroMotion } from "./useHeroMotion";

const availablePlants = 24;
const plantCards = [
  {
    name: "Rosemary Bloom",
    price: "280 QAR",
    image:
      "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Sunlit Orchid",
    price: "360 QAR",
    image:
      "https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Botanical White",
    price: "320 QAR",
    image:
      "https://images.unsplash.com/photo-1468327768560-75b778cbb551?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Desert Bloom",
    price: "410 QAR",
    image:
      "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=900&q=80",
  },
];

export function HomePage() {
  const containerRef = useRef<HTMLElement>(null);
  useHeroMotion(containerRef);

  return (
    <article className="home" ref={containerRef} data-testid="home-page">
      <header className="hero-section">
        <p className="hero-section__eyebrow home__wordmark">QLeaves</p>

        <div className="hero-metric home__count-wrap">
          <span className="hero-metric__number home__count" aria-live="polite">
            {availablePlants}
          </span>
          <span className="hero-metric__label home__count-note">
            Plants Remaining
          </span>
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
      </header>

      <section className="paper-rip-section home__paper-rip" aria-label="Plant story scroll reveal">
        <div className="paper-rip-section__inner">
          <p className="paper-rip-section__eyebrow">Curated living spaces</p>
          <h2>Thoughtful plants for work and home.</h2>
        </div>
      </section>

      <section className="plant-gallery home__plant-gallery" aria-label="Featured plant collection">
        <div className="plant-gallery__header">
          <p className="eyebrow">Collection</p>
          <h2>Fresh arrivals for quiet corners.</h2>
        </div>

        <div className="plant-grid">
          {plantCards.map((plant) => (
            <article key={plant.name} className="plant-card home__plant-card">
              <img src={plant.image} alt={plant.name} />
              <div className="plant-card__content">
                <h3>{plant.name}</h3>
                <p>{plant.price}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="shop-cta" data-testid="shop-cta">
        <h2 className="shop-cta__title home__featured">{content.nav.shop}</h2>
        <p className="shop-cta__message">Browse the full plant catalogue.</p>
        <Link to="/shop" className="shop-cta__link home__featured">
          Browse the catalogue
        </Link>
      </section>

      <section className="about-section home__about" aria-label="About QLeaves">
        <p className="eyebrow">About</p>
        <h2>We design room-by-room plant stories.</h2>
        <p>
          QLeaves sources resilient, design-led plants for homes and workspaces across
          Qatar, blending calm greenery with practical care guidance.
        </p>
      </section>
    </article>
  );
}

