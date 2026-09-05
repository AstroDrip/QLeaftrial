import { useSiteContent, useSiteLanguage } from "../app/providers";
import { siteLocaleLabels } from "../content/locales";

export function LanguageToggle() {
  const { language, setLanguage, isArabic } = useSiteLanguage();
  const content = useSiteContent();

  return (
    <button
      type="button"
      className="language-toggle"
      aria-label={content.aria.languageToggle}
      aria-pressed={isArabic}
      onClick={() => setLanguage(isArabic ? "en" : "ar")}
      data-testid="language-toggle"
    >
      <span className="language-toggle__track">
        <span className="language-toggle__label language-toggle__label--left">EN</span>
        <span className="language-toggle__thumb" data-active={isArabic ? "true" : "false"} />
        <span className="language-toggle__label language-toggle__label--right">AR</span>
      </span>
      <span className="sr-only">{siteLocaleLabels[language]}</span>
    </button>
  );
}
