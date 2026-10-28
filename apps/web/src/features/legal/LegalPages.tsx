import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSiteContent, useSiteLanguage, useStoreSettings } from "../../app/providers";
import { Seo } from "../../components/Seo";
import { WhatsAppIcon } from "../../components/icons";
import { FALLBACK_PHONE, WHATSAPP_URL } from "../../content/contact";
import { LEGAL_UPDATED, legalContent, type LegalDocument } from "./legal-content";
import "./LegalPages.css";

function LegalShell({ eyebrow, title, description, path, updated = true, children }: {
  eyebrow: string;
  title: string;
  description: string;
  path: string;
  updated?: boolean;
  children: ReactNode;
}) {
  const { language } = useSiteLanguage();
  return (
    <section className="page-shell legal-page">
      <Seo title={title} description={description} path={path} />
      <header className="page-shell__header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {updated ? <p className="legal-page__updated">{LEGAL_UPDATED[language]}</p> : null}
      </header>
      <div className="legal-page__content">{children}</div>
    </section>
  );
}

function SupportLink() {
  const { isArabic } = useSiteLanguage();
  return (
    <a className="legal-page__support" href={WHATSAPP_URL} target="_blank" rel="noreferrer">
      <WhatsAppIcon /> {isArabic ? "تواصل مع QLeaves عبر واتساب" : "Contact QLeaves on WhatsApp"}
    </a>
  );
}

function PolicyPage({ pick, path }: { pick: (content: (typeof legalContent)["en"]) => LegalDocument; path: string }) {
  const { language } = useSiteLanguage();
  const content = legalContent[language];
  const document = pick(content);
  return (
    <LegalShell eyebrow={document.eyebrow} title={document.title} description={document.description} path={path}>
      {document.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.body.map((block, index) => Array.isArray(block)
            ? <ul key={index}>{block.map((item) => <li key={item}>{item}</li>)}</ul>
            : <p key={index}>{block}</p>)}
        </section>
      ))}
      <section>
        <h2>{content.contactTitle}</h2>
        <p>{content.contactBody}</p>
        <SupportLink />
      </section>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return <PolicyPage pick={(content) => content.privacy} path="/privacy" />;
}

export function TermsPage() {
  return <PolicyPage pick={(content) => content.terms} path="/terms" />;
}

export function ShippingReturnsPage() {
  return <PolicyPage pick={(content) => content.shipping} path="/shipping-returns" />;
}

export function AboutPage() {
  const { about } = useSiteContent().legal;
  const settings = useStoreSettings();
  const business = settings.data;
  // Only details the shop has entered in admin are shown.
  const details = [
    [about.commercialRegistration, business?.commercialRegistration],
    [about.ecommerceLicense, business?.ecommerceLicense],
    [about.registeredAddress, business?.businessAddress],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const phone = business?.supportPhone ? { href: `tel:${business.supportPhone}`, label: business.supportPhone } : FALLBACK_PHONE;

  return (
    <LegalShell eyebrow={about.eyebrow} title={about.title} description={about.description} path="/about" updated={false}>
      <p className="legal-page__intro">{about.introduction}</p>
      {settings.isPending ? <p role="status">{about.loading}</p> : null}
      {settings.isError ? <p role="alert">{about.loadError}</p> : null}
      {details.length ? (
        <section aria-labelledby="about-business-heading">
          <h2 id="about-business-heading">{about.businessDetails}</h2>
          <dl className="legal-page__details">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <section aria-labelledby="about-support-heading">
        <h2 id="about-support-heading">{about.customerSupport}</h2>
        <dl className="legal-page__details">
          {business?.supportEmail ? <div><dt>{about.email}</dt><dd><a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a></dd></div> : null}
          <div><dt>{about.phone}</dt><dd><a href={phone.href} dir="ltr">{phone.label}</a></dd></div>
        </dl>
        <SupportLink />
      </section>
      <section aria-labelledby="about-documents-heading">
        <h2 id="about-documents-heading">{about.documents}</h2>
        <p>{about.documentsDescription}</p>
        <ul className="legal-page__links">
          <li><Link to="/privacy">{about.privacy}</Link></li>
          <li><Link to="/terms">{about.terms}</Link></li>
          <li><Link to="/shipping-returns">{about.shipping}</Link></li>
        </ul>
      </section>
    </LegalShell>
  );
}
