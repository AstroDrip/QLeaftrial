import "./home.css";
import { useRef } from "react";
import { AssembledPlantSection } from "./sections/AssembledPlantSection";
import { FeaturedPlantsSection } from "./sections/FeaturedPlantsSection";
import { HeroSection } from "./sections/HeroSection";
import { ShopCtaSection } from "./sections/ShopCtaSection";
import { useHeroMotion } from "./useHeroMotion";

export function HomePage() {
  const containerRef = useRef<HTMLElement>(null);
  useHeroMotion(containerRef);

  return (
    <article className="home" ref={containerRef} data-testid="home-page">
      <HeroSection />
      <AssembledPlantSection />
      <FeaturedPlantsSection />
      <ShopCtaSection />
    </article>
  );
}

