import { Link } from "react-router-dom";
import { prefetchRoute } from "../../app/route-modules";
import "./botanical-hero.css";

// The home page hero: a photograph of a sunlit room with plants on both sides, and the headline and Shop
// now button on the bare wall between and above them.
//
// Wide screens use the landscape photo. It is never cropped sideways (only floor and ceiling may be
// trimmed), so the text column is pinned to the bare wall between the plants: 35.5% to 70.5% of the width.
// Phones use the tall version of the same room. It is shown at its own proportions, and the text sits on
// the empty upper wall (above 60% of the height, where the tallest leaves begin).

export const HERO_PHOTO = {
  large: "/media/hero/hero-room-1376.webp",
  width: 1376,
  height: 768,
  portrait: "/media/hero/hero-room-portrait-896.webp 896w, /media/hero/hero-room-portrait-600.webp 600w",
};

type Copy = { eyebrow: string; title: string; lead: string; cta: string };

export function BotanicalHero({ copy }: { copy: Copy }) {
  return (
    <section className="botanical-hero" aria-labelledby="hero-heading">
      <picture className="botanical-hero__photo">
        <source media="(max-width: 600px)" srcSet={HERO_PHOTO.portrait} sizes="100vw" width={896} height={1200} />
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
