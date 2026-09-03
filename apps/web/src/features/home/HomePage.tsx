import { content } from "../../content/en";

export function HomePage() {
  return (
    <section className="hero">
      <h1>{content.home.heroTitle}</h1>
      <p>{content.home.heroSubtitle}</p>
    </section>
  );
}
