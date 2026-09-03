import { content } from "../content/en";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="not-found" data-testid="not-found">
      <h1>Page not found</h1>
      <p>No plants here.</p>
      <Link to="/">{content.nav.shop}</Link>
    </section>
  );
}
