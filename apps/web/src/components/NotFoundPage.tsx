import { Link } from "react-router-dom";
import { Seo } from "./Seo";
import { useSiteLanguage } from "../app/providers";

export function NotFoundPage() {
  const { content, isArabic } = useSiteLanguage();
  return (
    <section className="not-found" data-testid="not-found">
      <Seo title={content.notFound.title} description={isArabic ? "صفحة QLeaves هذه غير موجودة." : "This QLeaves page does not exist."} path={window.location.pathname} noIndex />
      <h1>{content.notFound.title}</h1>
      <p>{content.notFound.message}</p>
      <Link to="/shop">{content.notFound.action}</Link>
    </section>
  );
}
