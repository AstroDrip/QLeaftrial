import { content } from "../content/en";
import { Link } from "react-router-dom";
import { Seo } from "./Seo";

export function NotFoundPage() {
  return (
    <section className="not-found" data-testid="not-found">
      <Seo title="Page not found" description="This QLeaves page does not exist." path={window.location.pathname} noIndex />
      <h1>Page not found</h1>
      <p>No plants here.</p>
      <Link to="/">{content.nav.shop}</Link>
    </section>
  );
}
