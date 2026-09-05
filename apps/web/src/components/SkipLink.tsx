import { useSiteContent } from "../app/providers";

export function SkipLink({ children }: { children?: React.ReactNode }) {
  const content = useSiteContent();
  return (
    <a href="#main-content" className="skip-link" data-testid="skip-link">
      {children ?? content.common.skipToContent}
    </a>
  );
}
