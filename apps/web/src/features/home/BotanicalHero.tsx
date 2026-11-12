import { Link } from "react-router-dom";
import { prefetchRoute } from "../../app/route-modules";
import "./botanical-hero.css";

// The home page hero: one photograph of a sunlit room with plants on both sides, and the headline and
// Shop now button on the empty wall between them.
//
// On wide screens the photo is never cropped sideways (the hero keeps the photo's proportions and may
// only trim floor and ceiling), so the text column can be pinned to the stretch of bare wall, which runs
// from 35.5% to 70.5% of the photo's width. That keeps every word and the button clear of the leaves at
// any width. On narrow screens there is no room beside the plants: the text comes first and the whole
// photo follows underneath.

export const HERO_PHOTO = { large: "/media/hero/hero-room-1376.webp", small: "/media/hero/hero-room-900.webp", width: 1376, height: 768 };

type Copy = { eyebrow: string; title: string; lead: string; cta: string };

export function BotanicalHero({ copy }: { copy: Copy }) {
  return (
    <section className="botanical-hero" aria-labelledby="hero-heading">
      <picture className="botanical-hero__photo">
        <source media="(max-width: 900px)" srcSet={HERO_PHOTO.small} />
        <img
          src={HERO_PHOTO.large}
          width={HERO_PHOTO.width}
          height={HERO_PHOTO.height}
          alt=""
          decoding="async"
          fetchPriority="high"
        />
      </picture>
      <div className="botanical-hero__copy">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 id="hero-heading">{copy.title}</h1>
        <p className="botanical-hero__lead">{copy.lead}</p>
        <div className="botanical-hero__actions">
          <Link to="/shop" className="button botanical-hero__cta" onMouseEnter={() => prefetchRoute("/shop")} onFocus={() => prefetchRoute("/shop")}>{copy.cta}</Link>
        </div>
      </div>
    </section>
  );
}
