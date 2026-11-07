import "./home.css";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSiteLanguage, useStoreSettings } from "../../app/providers";
import { prefetchRoute } from "../../app/route-modules";
import { Seo, qleavesStructuredData } from "../../components/Seo";
import { productApi } from "../catalog/product-api";
import { ProductCard } from "../catalog/ProductCard";
import { HeroCarousel } from "./HeroCarousel";
import { HeroParticles } from "./HeroParticles";
import { ReviewStories } from "../reviews/ReviewStories";

const CATEGORY_IMAGES: Record<string, string> = {
  "Indoor Plants": "/media/plants/monstera-deliciosa-big-size-120-cm-640.webp",
  "Table Top Plants": "/media/plants/pothos-njoy-640.webp",
  "Gift Plants": "/media/plants/anthurium-red-55-cm-640.webp",
  "Outdoor Plants": "/media/plants/bougainvillea-pink-640.webp",
  "Garden Accessories": "/media/plants/leca-640.webp",
};

export function HomePage() {
  const { content, language, isArabic } = useSiteLanguage();
  const settings = useStoreSettings();
  const orderingEnabled = settings.data?.orderingEnabled ?? true;
  const t = content.home;
  const products = useQuery({
    queryKey: ["products", "home", language],
    queryFn: () => productApi.list({ page: 1, sort: "newest", lang: language }),
    staleTime: 60_000,
  });
  const filters = useQuery({ queryKey: ["catalog-filters"], queryFn: () => productApi.filters(), staleTime: 300_000 });
  const featured = products.data?.items.slice(0, 8) ?? [];
  const categories = Object.entries(filters.data?.categoryCounts ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <article className="home" data-testid="home-page">
      <Seo title="QLeaves" description={isArabic ? "نباتات داخلية وخارجية مختارة بعناية مع التوصيل داخل قطر." : "Hand-picked indoor and outdoor plants, delivered across Qatar."} path="/" structuredData={qleavesStructuredData} />

      <section className="home-hero" aria-labelledby="hero-heading">
        <HeroParticles />
        <div className="home-hero__copy">
          <p className="eyebrow">{t.basedIn}</p>
          <h1 id="hero-heading">{t.heroTitle}</h1>
          <p className="home-hero__lead">{t.heroSubtitle}</p>
          <div className="home-hero__actions">
            <Link to="/shop" className="button" onMouseEnter={() => prefetchRoute("/shop")}>{t.shopCta}</Link>
          </div>
        </div>
        <HeroCarousel isArabic={isArabic} />
      </section>

      <section className="home-promises container" aria-label={t.promisesLabel}>
        <ul>
          {t.promises.map(([title, body]) => (
            <li key={title}><strong>{title}</strong><span>{body}</span></li>
          ))}
        </ul>
      </section>

      {categories.length ? (
        <section className="home-section container" aria-labelledby="home-categories">
          <div className="section-head">
            <h2 id="home-categories">{t.categoriesTitle}</h2>
            <Link to="/shop">{t.viewAll}</Link>
          </div>
          <ul className="home-categories">
            {categories.map(([category, count]) => (
              <li key={category}>
                <Link to={`/shop?category=${encodeURIComponent(category)}`} onMouseEnter={() => prefetchRoute("/shop")}>
                  <img src={CATEGORY_IMAGES[category] ?? "/images/hero/leaf-1.svg"} alt="" width={640} height={640} loading="lazy" decoding="async" />
                  <span className="home-categories__name">{isArabic ? filters.data?.categoryLabels?.[category] || category : category}</span>
                  <span className="home-categories__count">{t.productCount(count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="home-section container" aria-labelledby="home-featured">
        <div className="section-head">
          <h2 id="home-featured">{t.featuredTitle}</h2>
          <Link to="/shop">{t.viewAll}</Link>
        </div>
        {products.isError ? (
          <p className="home__notice" role="alert">
            {t.inventoryError}{isArabic ? "" : `: ${(products.error as Error).message}`}
          </p>
        ) : products.isPending ? (
          <p role="status">{content.catalog.loading}</p>
        ) : (
          <ul className="product-grid">
            {featured.map((product) => <ProductCard key={product.id} product={product} orderingEnabled={orderingEnabled} headingLevel={3} />)}
          </ul>
        )}
      </section>

      <ReviewStories />
    </article>
  );
}
