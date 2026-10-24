import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSiteContent, useStoreSettings } from "../../app/providers";
import { Seo } from "../../components/Seo";
import "./LegalPages.css";

const WHATSAPP_URL = "https://wa.me/97477551056";

function LegalShell({
  eyebrow,
  title,
  description,
  path,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  path: string;
  children: ReactNode;
}) {
  const content = useSiteContent();
  return (
    <section className="page-shell legal-page">
      <Seo title={title} description={description} path={path} />
      <div className="page-shell__header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <p className="legal-page__updated">{content.legal.lastUpdated}</p>
      <div className="legal-page__content">{children}</div>
    </section>
  );
}

function SupportLink() {
  const content = useSiteContent();
  return (
    <a href={WHATSAPP_URL} target="_blank" rel="noreferrer">
      {content.legal.support}
    </a>
  );
}

function LegalSections({ sections }: { sections: readonly (readonly [string, string])[] }) {
  return (
    <>
      {sections.map(([heading, body]) => (
        <section key={heading}>
          <h2>{heading}</h2>
          <p>{body}</p>
        </section>
      ))}
      <p><SupportLink /></p>
    </>
  );
}

export function PrivacyPage() {
  const { privacy } = useSiteContent().legal;
  return (
    <LegalShell eyebrow={privacy.eyebrow} title={privacy.title} description={privacy.description} path="/privacy">
      <LegalSections sections={privacy.sections} />
    </LegalShell>
  );
}

export function TermsPage() {
  const { terms } = useSiteContent().legal;
  return (
    <LegalShell eyebrow={terms.eyebrow} title={terms.title} description={terms.description} path="/terms">
      <LegalSections sections={terms.sections} />
    </LegalShell>
  );
}

export function ShippingReturnsPage() {
  const { shipping } = useSiteContent().legal;
  return (
    <LegalShell eyebrow={shipping.eyebrow} title={shipping.title} description={shipping.description} path="/shipping-returns">
      <LegalSections sections={shipping.sections} />
    </LegalShell>
  );
}

export function AboutPage() {
  const { about } = useSiteContent().legal;
  const settings = useStoreSettings();
  const business = settings.data;
  const details = [
    [about.commercialRegistration, business?.commercialRegistration],
    [about.ecommerceLicense, business?.ecommerceLicense],
    [about.registeredAddress, business?.businessAddress],
  ] as const;

  return (
    <LegalShell eyebrow={about.eyebrow} title={about.title} description={about.description} path="/about">
      <p>{about.introduction}</p>
      <section className="about-business-details" aria-labelledby="about-business-heading">
        <h2 id="about-business-heading">{about.businessDetails}</h2>
        {settings.isPending ? <p role="status">{about.loading}</p> : null}
        {settings.isError ? <p role="alert">{about.loadError}</p> : null}
        <dl>
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || about.unavailable}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="about-support-heading">
        <h2 id="about-support-heading">{about.customerSupport}</h2>
        <p>{about.email}: {business?.supportEmail
          ? <a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a>
          : about.unavailable}</p>
        <p>{about.phone}: {business?.supportPhone
          ? <a href={`tel:${business.supportPhone}`}>{business.supportPhone}</a>
          : <a href="tel:+97477551056">+974 7755 1056</a>}</p>
      </section>
      <section aria-labelledby="about-documents-heading">
        <h2 id="about-documents-heading">{about.documents}</h2>
        <p>{about.documentsDescription}</p>
        <ul>
          <li><Link to="/privacy">{about.privacy}</Link></li>
          <li><Link to="/terms">{about.terms}</Link></li>
          <li><Link to="/shipping-returns">{about.shipping}</Link></li>
        </ul>
      </section>
    </LegalShell>
  );
}
