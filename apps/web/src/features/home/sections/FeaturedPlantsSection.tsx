import { Link } from "react-router-dom";
import { content } from "../../../content/en";

interface FeaturedPlant {
  readonly slug: string;
  readonly name: string;
  readonly image: string;
}

const featuredPlants: readonly FeaturedPlant[] = [
  { slug: "house-plant", name: "House Plant", image: "/images/hero/leaf-2.svg" },
  { slug: "fiddle-leaf-fig", name: "Fiddle Leaf Fig", image: "/images/hero/leaf-1.svg" },
  { slug: "monstera-deliciosa", name: "Monstera Deliciosa", image: "/images/hero/leaf-3.svg" },
];

export function FeaturedPlantsSection() {
  return (
    <section className="featured-section" data-testid="featured-section">
      <h2 className="featured-section__title home__featured">{content.home.featuredTitle}</h2>
      <ul className="featured-list">
        {featuredPlants.map((plant) => (
          <li key={plant.slug} className="featured-card home__featured">
            <img src={plant.image} alt="" className="featured-card__image" />
            <h3 className="featured-card__name">{plant.name}</h3>
            <Link
              to={`/plants/${plant.slug}`}
              className="featured-card__link"
              data-testid={`view-${plant.slug}`}
            >
              {content.catalog.viewProduct(plant.name)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
