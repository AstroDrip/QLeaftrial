import "./home.css";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSiteContent, useSiteLanguage } from "../../app/providers";
import { Seo, qleavesStructuredData } from "../../components/Seo";
import { AddToCartButton } from "../cart/AddToCartButton";
import { productApi } from "../catalog/product-api";
import type { ProductSummary } from "../catalog/product-types";
import { useHeroMotion } from "./useHeroMotion";
import { FallbackImage } from "../../components/FallbackImage";

const plants = [
  { name: "Monstera", nameAr: "مونستيرا", latin: "Monstera deliciosa", stock: 14, light: "Bright, indirect", lightAr: "إضاءة ساطعة غير مباشرة", price: 180, image: "/images/hero/leaf-1.svg" },
  { name: "Snake Plant", nameAr: "نبات الثعبان", latin: "Dracaena trifasciata", stock: 26, light: "Low to bright", lightAr: "إضاءة منخفضة إلى ساطعة", price: 95, image: "/images/hero/leaf-2.svg" },
  { name: "Golden Pothos", nameAr: "بوتس ذهبي", latin: "Epipremnum aureum", stock: 31, light: "Low to medium", lightAr: "إضاءة منخفضة إلى متوسطة", price: 80, image: "/images/hero/leaf-3.svg" },
  { name: "String of Turtles", nameAr: "سترينغ أوف ترتلز", latin: "Peperomia prostrata", stock: 18, light: "Bright, indirect", lightAr: "إضاءة ساطعة غير مباشرة", price: 110, image: "/images/hero/leaf-1.svg" },
  { name: "Tiger's Jaw", nameAr: "فك النمر", latin: "Faucaria tigrina", stock: 22, light: "Full sun", lightAr: "شمس كاملة", price: 75, image: "/images/hero/leaf-2.svg" },
  { name: "Old Lady Cactus", nameAr: "صبار العجوز", latin: "Mammillaria vetula", stock: 11, light: "Full sun", lightAr: "شمس كاملة", price: 90, image: "/images/hero/leaf-3.svg" },
] as const;

const fallbackTotalPlants = plants.reduce((sum, plant) => sum + plant.stock, 0);

export function HomePage() {
  const content = useSiteContent();
  const { language } = useSiteLanguage();
  const rootRef = useRef<HTMLElement>(null);
  const productsQuery = useQuery({
    queryKey: ["products", "home", language],
    queryFn: () => productApi.list({ page: 1, lang: language }),
  });
  const livePlants = productsQuery.data?.items.slice(0, 6) ?? [];
  const totalPlants = livePlants.length
    ? livePlants.reduce((sum, plant) => sum + plant.stock, 0)
    : fallbackTotalPlants;
  useHeroMotion(rootRef, totalPlants);

  return (
    <article className="home" ref={rootRef} data-testid="home-page">
      <Seo title="QLeaves" description="Indoor plants thoughtfully selected and sold in Qatar." path="/" structuredData={qleavesStructuredData} />
      <section id="hero" className="qhero" aria-labelledby="hero-heading">
        <canvas id="heroCanvas" className="qhero__canvas" aria-hidden="true" />
        <div className="qhero__mid">
          <div className="qhero__count-row">
            <span id="plantCount" className="qhero__count" aria-live="polite">0</span>
            <span id="countLabel" className="qhero__count-label">{content.home.remaining}</span>
          </div>
          <h1 id="hero-heading" className="sr-only">{content.home.heroTitle}</h1>
          <p className="qhero__sub">{content.home.heroSubtitle}</p>
          <Link to="/shop" className="qhero__shop-link">{content.home.shopCta} ↗</Link>
        </div>
        <div className="qhero__bottom"><span>{content.home.basedIn}</span><div className="scroll-cue"><span>{content.home.scroll}</span><span className="stem" /></div></div>
      </section>

      <section id="ripWrap" className="rip-wrap" aria-label={content.home.storyLabel}>
        <div id="ripSticky" className="rip-sticky">
          <div className="torn-reveal"><span className="eyebrow">{content.home.newStock}</span><h2>{content.home.tornTitle}</h2></div>
          <div className="paper-half" id="paperLeft"><div className="grain"><div className="stamp">QLeaves<br />Qatar</div><span>{content.home.handleWithCare}</span></div></div>
          <div className="paper-half" id="paperRight"><div className="grain"><span>{content.home.paperWords}</span></div></div>
        </div>
      </section>

      <section id="plants" className="home-plants">
        <div className="section-head"><div><span className="eyebrow">{content.home.onHand}</span><h2>{content.home.featuredTitle}</h2></div><p>{content.home.availability}</p></div>
        {productsQuery.isError ? (
          <p className="home-plants__notice" role="alert">
            {content.home.inventoryUnavailable}: {(productsQuery.error as Error).message}
          </p>
        ) : null}
        <div className="home-plant-grid" id="plantGrid">
          {(livePlants.length ? livePlants : plants).map((plant, index) => {
            const livePlant = "priceQar" in plant ? plant as ProductSummary : null;
            const referencePlant = plants[index % plants.length];
            const image = livePlant?.image?.url ?? referencePlant.image;
            const fallbackName = language === "ar" ? referencePlant.nameAr : referencePlant.name;
            const alt = livePlant?.image?.altText || livePlant?.name || fallbackName;
            const latin = livePlant ? "" : "latin" in plant ? plant.latin : "";
            const price = livePlant?.priceQar ?? ("price" in plant ? plant.price : 0);
            return <article className="home-plant-card" key={index}>
              <div className="frame"><span className="stock">{plant.stock} {content.home.inStock}</span><FallbackImage src={image} alt={alt} loading="lazy" decoding="async" /></div>
              <h3 className="name">{livePlant?.name ?? (language === "ar" ? referencePlant.nameAr : referencePlant.name)}</h3><p className="latin">{latin}</p>
              <div className="meta"><span className="light">{livePlant?.light ?? (language === "ar" ? referencePlant.lightAr : referencePlant.light)}</span><span className="price">{price} QAR</span></div>
              {livePlant ? <AddToCartButton product={livePlant} className="home-plant-card__cart" /> : null}
            </article>;
          })}
        </div>
      </section>

      <section id="philosophy" className="philosophy"><blockquote>{content.home.motto}</blockquote><cite>QLeaves · Qatar</cite></section>

      <section id="about" className="home-about">
        <div className="frame home-about__visual"><img src="/brand/qleaves-logo.png" alt={content.home.emblemAlt} /></div>
        <div><span className="eyebrow">{content.home.aboutEyebrow}</span><h2>{content.home.aboutTitle}</h2><p>{content.home.aboutBody}</p><p>{content.home.aboutContact}</p><p className="signoff">{content.home.signoff}</p></div>
      </section>
    </article>
  );
}
