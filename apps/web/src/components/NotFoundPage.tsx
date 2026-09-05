import { Link } from "react-router-dom";
import { useSiteContent } from "../app/providers";
import { Seo } from "./Seo";

export function NotFoundPage() {
  const content = useSiteContent();
  return (
    <section className="not-found" data-testid="not-found">
      <Seo title={content.notFound.title} description={content.notFound.body} path={window.location.pathname} noIndex />
      <h1>{content.notFound.title}</h1>
      <p>{content.notFound.body}</p>
      <Link to="/shop">{content.notFound.back}</Link>
    </section>
  );
}
