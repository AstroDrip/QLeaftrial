import { useSiteLanguage } from "../app/providers";

export function LanguageToggle() {
  const { setLanguage, isArabic, content } = useSiteLanguage();

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
    </button>
  );
}
