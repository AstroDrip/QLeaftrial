import { lazy, Suspense, useMemo, useState } from "react";
import { HERO_POOL, HeroGallery, pickRandom } from "./HeroGallery";

// WebGL code (ogl) loads separately so it never delays the first paint.
const FlexCarousel = lazy(() => import("../../components/flex-carousel/FlexCarousel"));

function supportsWebGl2(): boolean {
  try {
    return typeof document !== "undefined" && Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    return false;
  }
}

// A looping, draggable photo row. Edges get a Gaussian blur that fades in toward the sides.
export function HeroCarousel({ isArabic }: { isArabic: boolean }) {
  const [webGl] = useState(supportsWebGl2);
  const order = useMemo(() => pickRandom(HERO_POOL, HERO_POOL.length), []);
  const items = order.map((image) => ({ src: image.src, alt: isArabic ? image.altAr : image.alt, title: isArabic ? image.altAr : image.alt }));

  if (!webGl) return <HeroGallery isArabic={isArabic} />;

  const placeholder = (
    <img className="hero-carousel__placeholder" src={order[0].src} alt={items[0].alt} width={640} height={640} fetchPriority="high" decoding="async" />
  );

  return (
    <div className="hero-carousel" data-testid="hero-carousel">
      <Suspense fallback={placeholder}>
        <FlexCarousel
          items={items}
          intro="rise"
          fit="square"
          // Clicking a card zooms it ~1.3x and moves the caption down with it; at half the
          // box height the zoomed card and its caption still fit inside the carousel.
          cardHeight={0.5}
          gap={16}
          radius={18}
          autoplay
          interval={4}
          captureWheel={false}
          bend={0.22}
          dispersion={0.08}
          captions
        />
      </Suspense>
      <span className="hero-carousel__blur hero-carousel__blur--start" aria-hidden="true" />
      <span className="hero-carousel__blur hero-carousel__blur--end" aria-hidden="true" />
    </div>
  );
}
