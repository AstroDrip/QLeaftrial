import { Link } from "react-router-dom";
import { useSiteLanguage, useStoreSettings } from "../app/providers";
import "./Footer.css";

export function Footer() {
  const { language } = useSiteLanguage();
  const settings = useStoreSettings();
  const business = settings.data;
  const details = [
    [language === "ar" ? "السجل التجاري" : "Commercial Registration (CR)", business?.commercialRegistration],
    [language === "ar" ? "ترخيص التجارة الإلكترونية" : "E-commerce license", business?.ecommerceLicense],
    [language === "ar" ? "العنوان المسجل" : "Registered address", business?.businessAddress],
  ] as const;
  return (
    <footer className="site-footer" data-testid="site-footer" dir={language === "ar" ? "rtl" : "ltr"} lang={language}>
      <div className="site-footer__brand"><strong>QLeaves</strong><span>For the love of art and plants.</span></div>
      <span>Founded in 2020</span>
      <address className="site-footer__business-details">
        {details.map(([label, value]) => <span key={label}>{label}: {value || (language === "ar" ? "يُرجى الإضافة" : "To be provided")}</span>)}
        <span>{language === "ar" ? "البريد الإلكتروني" : "Customer service email"}: {business?.supportEmail
          ? <a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a>
          : (language === "ar" ? "يُرجى الإضافة" : "To be provided")}</span>
        <span>{language === "ar" ? "الهاتف" : "Customer service phone"}: <a href={`tel:${business?.supportPhone || "+97477551056"}`}>{business?.supportPhone || "+974 7755 1056"}</a></span>
      </address>
      <span>© {new Date().getFullYear()} QLeaves · Qatar</span>
      <nav className="site-footer__legal" aria-label="Legal">
        <Link to="/about">{language === "ar" ? "من نحن" : "About us"}</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/shipping-returns">Shipping & Returns</Link>
      </nav>
      <div className="site-footer__links">
        <a href="https://www.instagram.com/qleaves.qa?igsi=MWh6YzR4dWMyazA0cw==" target="_blank" rel="noreferrer" aria-label="QLeaves on Instagram"><svg className="site-footer__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>
        <a href="https://wa.me/97477551056" target="_blank" rel="noreferrer" aria-label="Chat with QLeaves on WhatsApp"><svg className="site-footer__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4A8 8 0 1 1 20 11.7Z"/><path d="M9 8.5c.4 2.7 2 4.3 4.7 5.1l1.1-1.1c.3-.3.7-.4 1.1-.2l1.7.8"/></svg></a>
      </div>
      <span className="site-footer__credit">Built by <strong>QOZYD</strong></span>
    </footer>
  );
}
