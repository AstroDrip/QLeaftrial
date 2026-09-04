import "./home.css";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { content } from "../../content/en";
import { useHeroMotion } from "./useHeroMotion";

const plants = [
  { name: "Monstera", latin: "Monstera deliciosa", stock: 14, light: "Bright, indirect", price: 180, image: "/images/hero/leaf-1.svg" },
  { name: "Snake Plant", latin: "Dracaena trifasciata", stock: 26, light: "Low to bright", price: 95, image: "/images/hero/leaf-2.svg" },
  { name: "Golden Pothos", latin: "Epipremnum aureum", stock: 31, light: "Low to medium", price: 80, image: "/images/hero/leaf-3.svg" },
  { name: "String of Turtles", latin: "Peperomia prostrata", stock: 18, light: "Bright, indirect", price: 110, image: "/images/hero/leaf-1.svg" },
  { name: "Tiger's Jaw", latin: "Faucaria tigrina", stock: 22, light: "Full sun", price: 75, image: "/images/hero/leaf-2.svg" },
  { name: "Old Lady Cactus", latin: "Mammillaria vetula", stock: 11, light: "Full sun", price: 90, image: "/images/hero/leaf-3.svg" },
] as const;

const totalPlants = plants.reduce((sum, plant) => sum + plant.stock, 0);

export function HomePage() {
  const rootRef = useRef<HTMLElement>(null);
  useHeroMotion(rootRef, totalPlants);

  return (
    <article className="home" ref={rootRef} data-testid="home-page">
      <section id="hero" className="qhero" aria-labelledby="hero-heading">
        <canvas id="heroCanvas" className="qhero__canvas" aria-hidden="true" />
        <div className="qhero__mid">
          <div className="qhero__count-row">
            <span id="plantCount" className="qhero__count" aria-live="polite">0</span>
            <span id="countLabel" className="qhero__count-label">Plants<br />Remaining</span>
          </div>
          <h1 id="hero-heading" className="sr-only">{content.home.heroTitle}</h1>
          <p className="qhero__sub">{content.home.heroSubtitle}</p>
          <Link to="/shop" className="qhero__shop-link">{content.home.shopCta} ↗</Link>
        </div>
        <div className="qhero__bottom"><span>Based in Qatar · Indoor plants</span><div className="scroll-cue"><span>Scroll</span><span className="stem" /></div></div>
      </section>

      <section id="ripWrap" className="rip-wrap" aria-label="Plant story scroll reveal">
        <div id="ripSticky" className="rip-sticky">
          <div className="torn-reveal"><span className="eyebrow">New stock, lovingly chosen</span><h2>For the love of <em>art &amp; plants</em></h2></div>
          <div className="paper-half" id="paperLeft"><div className="grain"><div className="stamp">QLeaves<br />Qatar</div><span>Handle with care</span></div></div>
          <div className="paper-half" id="paperRight"><div className="grain"><span>Plants · Home · Warmth</span></div></div>
          <div className="rip-progress" id="ripProgressLabel">Keep scrolling</div>
        </div>
      </section>

      <section id="plants" className="home-plants">
        <div className="section-head"><div><span className="eyebrow">On hand today</span><h2>{content.home.featuredTitle}</h2></div><p>Beautiful indoor plants, thoughtfully selected in Qatar. Reach out for current availability, prices and enquiries.</p></div>
        <div className="home-plant-grid" id="plantGrid">
          {plants.map((plant) => <article className="home-plant-card" key={plant.name}>
            <div className="frame"><span className="stock">{plant.stock} in stock</span><img src={plant.image} alt={plant.name} loading="lazy" /></div>
            <h3 className="name">{plant.name}</h3><p className="latin">{plant.latin}</p>
            <div className="meta"><span className="light">{plant.light}</span><span className="price">{plant.price} QAR</span></div>
          </article>)}
        </div>
      </section>

      <section id="philosophy" className="philosophy"><blockquote>{content.home.motto}</blockquote><cite>QLeaves · Qatar</cite></section>

      <section id="about" className="home-about">
        <div className="frame home-about__visual"><img src="/brand/qleaves-logo.png" alt="QLeaves plant emblem" /></div>
        <div><span className="eyebrow">About QLeaves</span><h2>Plants chosen to make a space feel lived in.</h2><p>QLeaves is a Qatar-based indoor plant store built around a simple idea: greenery should feel personal, warm and beautiful—not like another item pulled from a catalogue.</p><p>For prices, availability and enquiries, message us on Instagram or call <a href="tel:+97477551056">+974 7755 1056</a>.</p><p className="signoff">— For the love of art and plants.</p></div>
      </section>
    </article>
  );
}
