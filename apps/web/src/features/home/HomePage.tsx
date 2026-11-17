import "./home.css";
import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSiteLanguage, useStoreSettings } from "../../app/providers";
import { prefetchRoute } from "../../app/route-modules";
import { Seo, qleavesStructuredData } from "../../components/Seo";
import { productApi } from "../catalog/product-api";
import { ProductCard } from "../catalog/ProductCard";
import { CategoryRail } from "./CategoryRail";
import { BotanicalHero } from "./BotanicalHero";
import { ReviewStories } from "../reviews/ReviewStories";
import { catalogueFreshness, categoryCounts, useCatalogue } from "../catalog/catalogue-client";
import { catalogueListResponse, catalogueProductToSummary, sortCatalogue } from "../catalog/catalogue-view";
import { friendlyError } from "../../lib/friendly-error";
import type { ProductSummary } from "../catalog/product-types";
import type { CatalogueProduct } from "../catalog/catalogue-types";
import { categoryName, findShopCategory, orderedCategoryCounts } from "../catalog/shop-categories";
import { readHomeBootstrap } from "./home-bootstrap";
import { pickShelves, shelfPools, LOW_LIGHT, type ShelfProduct } from "./home-shelves";
import { sessionSeed } from "./home-seed";
import { startPhotos } from "./start-photos";

// Each category's photograph is set in lib/shop-categories.ts; unlisted categories fall back to a leaf drawing.
function categoryImage(category: string): { image: string; srcSet?: string } {
  const found = findShopCategory(category);
  return found ? { image: `${found.image}-640.webp`, srcSet: `${found.image}-640.webp 640w, ${found.image}-960.webp 960w` } : { image: "/images/hero/leaf-1.svg" };
}

type Shelf = { id: string; title: string; link: string; items: ProductSummary[] };
type Candidate = ShelfProduct & { summary: ProductSummary };

// A row of real products with a heading and a link to the matching shop view. Empty shelves are not drawn.
function ProductShelf({ shelf, orderingEnabled, viewAll, start }: { shelf: Shelf; orderingEnabled: boolean; viewAll: string; start: Record<string, number> }) {
  if (shelf.items.length === 0) return null;
  return (
    <section className="home-section container" aria-labelledby={`home-${shelf.id}`} data-testid={`shelf-${shelf.id}`}>
      <div className="section-head">
        <h2 id={`home-${shelf.id}`}>{shelf.title}</h2>
        <Link to={shelf.link}>{viewAll}</Link>
      </div>
      <ul className="product-grid">
        {shelf.items.map((product) => <ProductCard key={product.id} product={product} orderingEnabled={orderingEnabled} headingLevel={3} startPhoto={start[product.id] ?? 0} />)}
      </ul>
    </section>
  );
}

// Fades the progressive blur in over the first stretch of scrolling (one blur-strip height): 0 at rest, so the hero
// is sharp, 1 once the categories are sliding over it. One passive scroll listener, one style write per frame.
function useStageBlur() {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The strip appears once the categories have loaded, so it is looked up on each frame rather than once.
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = strip.current;
      if (!element) return;
      const distance = element.offsetHeight || 1;
      const amount = Math.min(1, Math.max(0, window.scrollY / distance));
      element.style.setProperty("--stage-blur", amount.toFixed(3));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    const settle = window.setTimeout(update, 1500);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.clearTimeout(settle);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return strip;
}

export function HomePage() {
  const { content, language, isArabic } = useSiteLanguage();
  const stageBlur = useStageBlur();
  const settings = useStoreSettings();
  const orderingEnabled = settings.data?.orderingEnabled ?? true;
  const t = content.home;
  // The saved catalogue fills the page at once and stands in if the live API is down; the live lists
  // replace it as soon as they arrive. Counts are always real counts of published products.
  // Before either arrives (a first visit, a slow or unreachable API) the page shows the bootstrap that shipped
  // inside its own HTML: no request, so no wait. A catalogue at least as new as the bootstrap replaces it.
  const catalogue = useCatalogue();
  const bootstrap = readHomeBootstrap();
  const useBootstrap = Boolean(bootstrap) && (!catalogue.data || catalogueFreshness(catalogue.data) < catalogueFreshness(bootstrap));
  const shownProducts: CatalogueProduct[] | undefined = useBootstrap ? bootstrap!.products : catalogue.data?.products;
  const savedFeatured = shownProducts
    ? catalogueListResponse(shownProducts, { page: 1, sort: "newest", lang: language }).items
    : undefined;
  const products = useQuery({
    queryKey: ["products", "home", language],
    queryFn: () => productApi.list({ page: 1, sort: "newest", lang: language }),
    staleTime: 60_000,
  });
  const filters = useQuery({ queryKey: ["catalog-filters"], queryFn: () => productApi.filters(), staleTime: 300_000 });
  const showingSaved = !products.data && Boolean(savedFeatured?.length);
  const savedCategories = useBootstrap
    ? Object.entries(bootstrap!.categoryCounts).map(([category, count]) => ({ category, categoryAr: bootstrap!.categoryLabelsAr[category] ?? null, count }))
    : catalogue.data ? categoryCounts(catalogue.data.products) : [];
  // Every category in the shop's order (lib/shop-categories.ts), empty ones included, once real counts are known.
  const counts: Record<string, number> | null = filters.data?.categoryCounts
    ?? (savedCategories.length ? Object.fromEntries(savedCategories.map((entry) => [entry.category, entry.count])) : null);
  const categories: Array<[string, number]> = counts ? orderedCategoryCounts(counts).map((entry) => [entry.category, entry.count]) : [];
  const categoryLabel = (category: string) =>
    categoryName(category, isArabic ? "ar" : "en", filters.data?.categoryLabels?.[category] || savedCategories.find((entry) => entry.category === category)?.categoryAr);

  // Shelves vary per visitor (lib/home-shelves.ts): a seed for this browsing session, renewed daily, picks from
  // the same pools the built-in data holds. Featured, offers and discovery come from the published catalogue; New
  // Arrivals from the live newest list once it arrives (garden accessories never among them). No product twice.
  const seed = useMemo(() => sessionSeed(), []);
  const entries: Candidate[] = (shownProducts ? sortCatalogue(shownProducts, "newest") : []).map((product) => ({ ...product, summary: catalogueProductToSummary(product, language) }));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  // A live product the saved catalogue knows keeps its English fields for the rules; its card shows the live data.
  const newest: Candidate[] = products.data?.items.map((item) => ({ ...(byId.get(item.id) ?? item), summary: item })) ?? entries;
  const picked = pickShelves(shelfPools(entries, newest), seed, { offers: orderingEnabled });
  const summaries = (items: Candidate[]) => items.map((item) => item.summary);
  const featuredShelf: Shelf = { id: "featured", title: isArabic ? "منتجات مميزة" : "Featured plants", link: "/shop?sort=featured", items: summaries(picked.featured) };
  const newShelf: Shelf = { id: "new", title: t.featuredTitle, link: "/shop", items: summaries(picked.new) };
  const offersShelf: Shelf = { id: "offers", title: isArabic ? "عروض" : "Offers", link: "/shop", items: summaries(picked.offers) };
  const easyShelf: Shelf = { id: "easy", title: isArabic ? "نباتات سهلة العناية" : "Easy-care plants", link: "/shop", items: summaries(picked.easy) };
  const lowLightShelf: Shelf = { id: "low-light", title: isArabic ? "مناسبة للإضاءة المنخفضة" : "Happy in lower light", link: "/shop?light=" + encodeURIComponent(LOW_LIGHT), items: summaries(picked.lowLight) };
  // Discovery shelves only make sense with a few products in them.
  const discovery = [easyShelf, lowLightShelf].map((shelf) => (shelf.items.length >= 2 ? shelf : { ...shelf, items: [] }));
  const start = startPhotos([featuredShelf, newShelf, offersShelf, ...discovery].flatMap((shelf) => shelf.items), seed);

  return (
    <article className="home" data-testid="home-page">
      <Seo title="QLeaves" description={isArabic ? "QLeaves متجر إلكتروني للنباتات في قطر: نباتات داخلية وخارجية مختارة بعناية مع التوصيل داخل قطر." : "QLeaves is an online plant store in Qatar: hand-picked indoor and outdoor plants, delivered across Qatar."} path="/" structuredData={qleavesStructuredData} />

      {/* The hero holds still while Shop by Category slides up over it (the sheet's soft blurred edge passes over
          the photo); once the categories have passed, the hero is released and the shelves follow as normal. */}
      <div className="home-stage">
      <BotanicalHero copy={{ eyebrow: t.basedIn, title: t.heroTitle, lead: t.heroSubtitle, cta: t.shopCta }} />

      {categories.length ? (
        <section className="home-section container home-stage__sheet" aria-labelledby="home-categories">
          <div className="home-stage__blur" aria-hidden="true" ref={stageBlur}><span /><span /><span /></div>
          <CategoryRail
            items={categories.map(([category, count]) => ({
              key: category,
              to: `/shop?category=${encodeURIComponent(category)}`,
              ...categoryImage(category),
              name: categoryLabel(category),
              // No product counts on the tiles; only an empty category says it is coming.
              count: count ? undefined : (isArabic ? "قريبًا" : "Coming soon"),
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
      </div>

      <ProductShelf shelf={featuredShelf} orderingEnabled={orderingEnabled} viewAll={t.viewAll} start={start} />

      {/* New arrivals keep their own loading and error states: they are the shelf that must never be empty. */}
      {products.isError && !showingSaved ? (
        <section className="home-section container" aria-labelledby="home-new">
          <div className="section-head"><h2 id="home-new">{t.featuredTitle}</h2><Link to="/shop">{t.viewAll}</Link></div>
          <p className="home__notice" role="alert">{friendlyError(products.error, language)}</p>
        </section>
      ) : products.isPending && !showingSaved ? (
        <section className="home-section container" aria-labelledby="home-new">
          <div className="section-head"><h2 id="home-new">{t.featuredTitle}</h2><Link to="/shop">{t.viewAll}</Link></div>
          <p role="status">{content.catalog.loading}</p>
        </section>
      ) : (
        <ProductShelf shelf={newShelf} orderingEnabled={orderingEnabled} viewAll={t.viewAll} start={start} />
      )}

      <ProductShelf shelf={offersShelf} orderingEnabled={orderingEnabled} viewAll={t.viewAll} start={start} />
      {discovery.map((shelf) => <ProductShelf key={shelf.id} shelf={shelf} orderingEnabled={orderingEnabled} viewAll={t.viewAll} start={start} />)}

      <section className="home-promises container" aria-label={t.promisesLabel}>
        <ul>
          {t.promises.map(([title, body]) => (
            <li key={title}><strong>{title}</strong><span>{body}</span></li>
          ))}
          <li>
            <strong>{isArabic ? "ادفع بالطريقة التي تناسبك" : "Pay the way that suits you"}</strong>
            <span>{isArabic ? "الدفع عند الاستلام أو عبر رابط دفع نرسله لك." : "Cash on delivery, or a payment link we send you."}</span>
          </li>
        </ul>
      </section>

      <ReviewStories />

      {/* The shop's own About us wording, unchanged; the full page has the business details. */}
      <section className="home-about container" aria-labelledby="home-about">
        <p className="eyebrow">{content.legal.about.eyebrow}</p>
        <h2 id="home-about">{content.legal.about.title}</h2>
        <p className="home-about__text">{content.legal.about.introduction}</p>
        <Link to="/about" className="button button--secondary">{isArabic ? "اعرف المزيد عنا" : "More about QLeaves"}</Link>
      </section>
    </article>
  );
}
