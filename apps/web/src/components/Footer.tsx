import { content } from "../content/en";

export function Footer() {
  return (
    <footer className="site-footer" data-testid="site-footer">
      <small>{content.tagline} · © {new Date().getFullYear()}</small>
    </footer>
  );
}

