import { content } from "../content/en";

export function Footer() {
  return (
    <footer className="site-footer" data-testid="site-footer">
      <small>{content.brand} · {content.tagline}</small>
    </footer>
  );
}
