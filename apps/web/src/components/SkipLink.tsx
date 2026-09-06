import { useSiteLanguage } from "../app/providers";

export function SkipLink({ children }: { children?: React.ReactNode }) {
  const { isArabic } = useSiteLanguage();
  return (
    <a href="#main-content" className="skip-link" data-testid="skip-link">
      {children ?? (isArabic ? "انتقل إلى المحتوى" : "Skip to content")}
    </a>
  );
}
