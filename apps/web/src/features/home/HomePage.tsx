import "./home.css";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSiteLanguage, useStoreSettings } from "../../app/providers";
import { prefetchRoute } from "../../app/route-modules";
import { Seo, qleavesStructuredData } from "../../components/Seo";
import { productApi } from "../catalog/product-api";
import { ProductCard } from "../catalog/ProductCard";
import { HeroCarousel } from "./HeroCarousel";
import { CategoryRail } from "./CategoryRail";
import { HeroParticles } from "./HeroParticles";
import { ReviewStories } from "../reviews/ReviewStories";
import { categoryCounts, useCatalogue } from "../catalog/catalogue-client";
import { catalogueListResponse } from "../catalog/catalogue-view";
import { friendlyError } from "../../lib/friendly-error";

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
  // The saved catalogue fills the page at once and stands in if the live API is down; the live lists
  // replace it as soon as they arrive. Counts are always real counts of published products.
  const catalogue = useCatalogue();
  const savedFeatured = catalogue.data
    ? catalogueListResponse(catalogue.data.products, { page: 1, sort: "newest", lang: language }).items
    : undefined;
  const products = useQuery({
    queryKey: ["products", "home", language],
    queryFn: () => productApi.list({ page: 1, sort: "newest", lang: language }),
    staleTime: 60_000,
  });
  const filters = useQuery({ queryKey: ["catalog-filters"], queryFn: () => productApi.filters(), staleTime: 300_000 });
  const featured = (products.data?.items ?? savedFeatured ?? []).slice(0, 8);
  const showingSaved = !products.data && Boolean(savedFeatured?.length);
  const savedCategories = catalogue.data ? categoryCounts(catalogue.data.products) : [];
  const categories: Array<[string, number]> = filters.data?.categoryCounts
    ? Object.entries(filters.data.categoryCounts).sort(([a], [b]) => a.localeCompare(b))
    : savedCategories.map((entry) => [entry.category, entry.count]);
  const categoryLabel = (category: string) =>
    filters.data?.categoryLabels?.[category] || savedCategories.find((entry) => entry.category === category)?.categoryAr || category;

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
          <CategoryRail
            items={categories.map(([category, count]) => ({
              key: category,
              to: `/shop?category=${encodeURIComponent(category)}`,
              image: CATEGORY_IMAGES[category] ?? "/images/hero/leaf-1.svg",
              name: isArabic ? categoryLabel(category) : category,
              count: t.productCount(count),
            }))}
            headingId="home-categories"
            title={t.categoriesTitle}
            viewAll={t.viewAll}
            previousLabel={t.categoriesPrevious}
            nextLabel={t.categoriesNext}
            onIntent={() => prefetchRoute("/shop")}
          />
        </section>
      ) : null}

      <section className="home-section container" aria-labelledby="home-featured">
        <div className="section-head">
          <h2 id="home-featured">{t.featuredTitle}</h2>
          <Link to="/shop">{t.viewAll}</Link>
        </div>
        {products.isError && !showingSaved ? (
          <p className="home__notice" role="alert">
            {friendlyError(products.error, language)}
          </p>
        ) : products.isPending && !showingSaved ? (
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
