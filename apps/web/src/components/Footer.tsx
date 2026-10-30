import type { Ref } from "react";
import { Link } from "react-router-dom";
import { useSiteLanguage } from "../app/providers";
import { INSTAGRAM_URL, WHATSAPP_URL } from "../content/contact";
import { InstagramIcon, WhatsAppIcon } from "./icons";

export function Footer({ ref }: { ref?: Ref<HTMLElement> }) {
  const { language, isArabic } = useSiteLanguage();
  const t = isArabic
    ? { tagline: "من أجل حب الفن والنباتات.", founded: "تأسست في 2018", help: "المساعدة", about: "من نحن", privacy: "الخصوصية", terms: "الشروط والأحكام", shipping: "الشحن والإرجاع", built: "تم التطوير بواسطة", rights: "قطر" }
    : { tagline: "For the love of art and plants.", founded: "Founded in 2018", help: "Help", about: "About us", privacy: "Privacy", terms: "Terms", shipping: "Shipping & Returns", built: "Built by", rights: "Qatar" };

  return (
    <footer ref={ref} className="site-footer" data-testid="site-footer" dir={isArabic ? "rtl" : "ltr"} lang={language}>
      <div className="container site-footer__grid">
        <div className="site-footer__brand">
          <img className="site-footer__logo" src="/brand/qleaves-logo-white.png" alt="QLeaves" width={150} height={52} loading="lazy" decoding="async" />
          <span>{t.tagline}</span>
          <span>{t.founded}</span>
          <div className="site-footer__social">
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" aria-label="QLeaves on Instagram"><InstagramIcon className="site-footer__icon" /></a>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" aria-label="Chat with QLeaves on WhatsApp"><WhatsAppIcon className="site-footer__icon" /></a>
          </div>
        </div>
        <nav className="site-footer__legal" aria-label={isArabic ? "روابط قانونية" : "Legal"}>
          <h2>{t.help}</h2>
          <ul>
            <li><Link to="/about">{t.about}</Link></li>
            <li><Link to="/shipping-returns">{t.shipping}</Link></li>
            <li><Link to="/privacy">{t.privacy}</Link></li>
            <li><Link to="/terms">{t.terms}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="container site-footer__bottom">
        <span>© {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", year: "numeric" }).format(new Date())} QLeaves · {t.rights}</span>
        <span className="site-footer__credit">{t.built} <strong>QOZYD</strong></span>
      </div>
    </footer>
  );
}
