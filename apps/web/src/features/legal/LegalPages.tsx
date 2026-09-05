import type { ReactNode } from "react";
import { useSiteContent } from "../../app/providers";
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
