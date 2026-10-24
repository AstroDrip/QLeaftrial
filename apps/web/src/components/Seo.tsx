import { useEffect } from "react";
import { useSiteLanguage } from "../app/providers";

const SITE_URL = "https://qleaves.qa";

type StructuredData = Record<string, unknown> | Record<string, unknown>[];

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.dataset.qleavesSeo = "true";
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => element!.setAttribute(key, value));
}

export function Seo({ title, description, path, image = "/brand/qleaves-logo.png", noIndex = false, structuredData }: {
  title: string;
  description: string;
  path: string;
  image?: string;
  noIndex?: boolean;
  structuredData?: StructuredData;
}) {
  const { language } = useSiteLanguage();
  useEffect(() => {
    const canonicalUrl = new URL(path, SITE_URL).toString();
    const imageUrl = new URL(image, SITE_URL).toString();
    document.title = title === "QLeaves" ? title : `${title} | QLeaves`;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: noIndex ? "noindex, follow" : "index, follow" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: document.title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: structuredData && !Array.isArray(structuredData) && structuredData["@type"] === "Product" ? "product" : "website" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: imageUrl });
    upsertMeta('meta[property="og:locale"]', { property: "og:locale", content: language === "ar" ? "ar_QA" : "en_QA" });

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      canonical.dataset.qleavesSeo = "true";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    document.head.querySelectorAll('script[data-qleaves-seo][type="application/ld+json"]').forEach((node) => node.remove());
    if (structuredData) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.qleavesSeo = "true";
      script.textContent = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }
  }, [description, image, language, noIndex, path, structuredData, title]);
  return null;
}

export const qleavesStructuredData = [
  { "@context": "https://schema.org", "@type": "Organization", name: "QLeaves", url: SITE_URL, logo: `${SITE_URL}/brand/qleaves-logo.png`, foundingDate: "2020", sameAs: ["https://www.instagram.com/qleaves.qa"] },
  { "@context": "https://schema.org", "@type": "LocalBusiness", name: "QLeaves", url: SITE_URL, image: `${SITE_URL}/brand/qleaves-logo.png`, telephone: "+97477551056", address: { "@type": "PostalAddress", addressCountry: "QA" } },
  { "@context": "https://schema.org", "@type": "WebSite", name: "QLeaves", url: SITE_URL },
];
