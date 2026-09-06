import "./home.css";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSiteLanguage } from "../../app/providers";
import { Seo, qleavesStructuredData } from "../../components/Seo";
import { AddToCartButton } from "../cart/AddToCartButton";
import { productApi } from "../catalog/product-api";
import type { ProductSummary } from "../catalog/product-types";
import { useHeroMotion } from "./useHeroMotion";
import { FallbackImage } from "../../components/FallbackImage";
import { localizeProduct } from "../catalog/localize-product";

const plants = [
  { name: "Monstera", nameAr: "مونستيرا", latin: "Monstera deliciosa", stock: 14, light: "Bright, indirect", lightAr: "إضاءة ساطعة غير مباشرة", price: 180, image: "/images/hero/leaf-1.svg" },
  { name: "Snake Plant", nameAr: "نبات الثعبان", latin: "Dracaena trifasciata", stock: 26, light: "Low to bright", lightAr: "إضاءة منخفضة إلى ساطعة", price: 95, image: "/images/hero/leaf-2.svg" },
  { name: "Golden Pothos", nameAr: "بوتس ذهبي", latin: "Epipremnum aureum", stock: 31, light: "Low to medium", lightAr: "إضاءة منخفضة إلى متوسطة", price: 80, image: "/images/hero/leaf-3.svg" },
  { name: "String of Turtles", nameAr: "سلسلة السلاحف", latin: "Peperomia prostrata", stock: 18, light: "Bright, indirect", lightAr: "إضاءة ساطعة غير مباشرة", price: 110, image: "/images/hero/leaf-1.svg" },
  { name: "Tiger's Jaw", nameAr: "فك النمر", latin: "Faucaria tigrina", stock: 22, light: "Full sun", lightAr: "شمس كاملة", price: 75, image: "/images/hero/leaf-2.svg" },
  { name: "Old Lady Cactus", nameAr: "صبار السيدة العجوز", latin: "Mammillaria vetula", stock: 11, light: "Full sun", lightAr: "شمس كاملة", price: 90, image: "/images/hero/leaf-3.svg" },
] as const;

const fallbackTotalPlants = plants.reduce((sum, plant) => sum + plant.stock, 0);

export function HomePage() {
  const { content, isArabic } = useSiteLanguage();
  const rootRef = useRef<HTMLElement>(null);
  const productsQuery = useQuery({
    queryKey: ["products", "home"],
    queryFn: () => productApi.list({ page: 1 }),
  });
  const livePlants = productsQuery.data?.items.slice(0, 6) ?? [];
  const totalPlants = livePlants.length
    ? livePlants.reduce((sum, plant) => sum + plant.stock, 0)
    : fallbackTotalPlants;
  useHeroMotion(rootRef, totalPlants);

  return (
    <article className="home" ref={rootRef} data-testid="home-page">
      <Seo title="QLeaves" description={isArabic ? "نباتات داخلية مختارة بعناية ومتوفرة في قطر." : "Indoor plants thoughtfully selected and sold in Qatar."} path="/" structuredData={qleavesStructuredData} />
      <section id="hero" className="qhero" aria-labelledby="hero-heading">
        <canvas id="heroCanvas" className="qhero__canvas" aria-hidden="true" />
        <div className="qhero__mid">
          <div className="qhero__count-row">
            <span id="plantCount" className="qhero__count" aria-live="polite">0</span>
            <span id="countLabel" className="qhero__count-label">{content.home.countLabel}</span>
          </div>
          <h1 id="hero-heading" className="sr-only">{content.home.heroTitle}</h1>
          <p className="qhero__sub">{content.home.heroSubtitle}</p>
          <Link to="/shop" className="qhero__shop-link">{content.home.shopCta} ↗</Link>
        </div>
        <div className="qhero__bottom"><span>{content.home.basedIn}</span><div className="scroll-cue"><span>{content.home.scroll}</span><span className="stem" /></div></div>
      </section>

      <section id="ripWrap" className="rip-wrap" aria-label={content.home.storyLabel}>
        <div id="ripSticky" className="rip-sticky">
          <div className="torn-reveal"><span className="eyebrow">{content.home.newStock}</span><h2>{content.home.storyTitle}</h2></div>
          <div className="paper-half" id="paperLeft"><div className="grain"><div className="stamp"><span lang="en" dir="ltr">QLeaves</span><br />{isArabic ? "قطر" : "Qatar"}</div><span>{content.home.handleCare}</span></div></div>
          <div className="paper-half" id="paperRight"><div className="grain"><span>{content.home.paperWords}</span></div></div>
        </div>
      </section>

      <section id="plants" className="home-plants">
        <div className="section-head"><div><span className="eyebrow">{content.home.onHand}</span><h2>{content.home.featuredTitle}</h2></div><p>{content.home.availability}</p></div>
        {productsQuery.isError ? (
          <p className="home-plants__notice" role="alert">
            {content.home.inventoryError}{isArabic ? "" : `: ${(productsQuery.error as Error).message}`}
          </p>
        ) : null}
        <div className="home-plant-grid" id="plantGrid">
          {(livePlants.length ? livePlants : plants).map((plant, index) => {
            const livePlant = "priceQar" in plant ? plant as ProductSummary : null;
            const localized = livePlant ? localizeProduct(livePlant, isArabic) : null;
            const referencePlant = plants[index % plants.length];
            const image = livePlant?.image?.url ?? referencePlant.image;
            const alt = isArabic ? localized?.name || referencePlant.nameAr : livePlant?.image?.altText || localized?.name || referencePlant.name;
            const latin = livePlant ? "" : "latin" in plant ? plant.latin : "";
            const price = livePlant?.priceQar ?? ("price" in plant ? plant.price : 0);
            return <article className="home-plant-card" key={index}>
              <div className="frame"><span className="stock">{plant.stock} {content.home.inStock}</span><FallbackImage src={image} alt={alt} loading="lazy" decoding="async" /></div>
              <h3 className="name">{localized?.name ?? (isArabic ? plant.nameAr : plant.name)}</h3><p className="latin" lang="la" dir="ltr">{latin}</p>
              <div className="meta"><span className="light">{localized?.light ?? (isArabic ? plant.lightAr : plant.light)}</span><span className="price">{price} QAR</span></div>
              {livePlant ? <AddToCartButton product={livePlant} className="home-plant-card__cart" /> : null}
            </article>;
          })}
        </div>
      </section>

      <section id="philosophy" className="philosophy"><blockquote>{content.home.motto}</blockquote><cite><span lang="en" dir="ltr">QLeaves</span> · {isArabic ? "قطر" : "Qatar"}</cite></section>

      <section id="about" className="home-about">
        <div className="frame home-about__visual"><img src="/brand/qleaves-logo.png" alt={isArabic ? "شعار نبات QLeaves" : "QLeaves plant emblem"} /></div>
        <div><span className="eyebrow">{content.home.about}</span><h2>{content.home.aboutTitle}</h2><p>{content.home.aboutBody}</p><p>{content.home.contact} <a href="tel:+97477551056">+974 7755 1056</a>.</p><p className="signoff">{content.home.signoff}</p></div>
      </section>
    </article>
  );
}
