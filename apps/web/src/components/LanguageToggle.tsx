import { useSiteContent, useSiteLanguage } from "../app/providers";
import "./LanguageToggle.css";

export function LanguageToggle() {
  const { setLanguage, isArabic } = useSiteLanguage();
  const content = useSiteContent();

  return (
    <label className="language-rocker language-rocker--small" data-testid="language-rocker">
      <input
        type="checkbox"
        checked={isArabic}
        aria-label={content.aria.languageToggle}
        onChange={(event) => setLanguage(event.currentTarget.checked ? "ar" : "en")}
      />
      <span className="language-rocker__left" aria-hidden="true">AR</span>
      <span className="language-rocker__right" aria-hidden="true">EN</span>
    </label>
  );
}
