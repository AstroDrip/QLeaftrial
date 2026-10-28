import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { Seo } from "../../components/Seo";
import { InvoiceDocument } from "../admin/AdminInvoicePage";
import { fetchPublicInvoice } from "./invoice-api";
import "../admin/invoice.css";

const copy = {
  en: { loading: "Loading your invoice…", missing: "This invoice link is not valid. Please contact QLeaves on WhatsApp.", print: "Print / save as PDF", home: "Back to QLeaves", title: "Your invoice" },
  ar: { loading: "جارٍ تحميل فاتورتك…", missing: "رابط الفاتورة غير صالح. يُرجى التواصل مع QLeaves عبر واتساب.", print: "طباعة / حفظ PDF", home: "العودة إلى QLeaves", title: "فاتورتك" },
};

export function PublicInvoicePage() {
  const { orderNumber = "" } = useParams();
  const [search] = useSearchParams();
  const token = search.get("token") ?? "";
  const { language } = useSiteLanguage();
  const t = copy[language];
  const invoice = useQuery({
    queryKey: ["public-invoice", orderNumber, token],
    queryFn: () => fetchPublicInvoice(orderNumber, token),
    enabled: Boolean(orderNumber && token),
    retry: false,
    staleTime: 60_000,
  });

  return (
    <section className="page-shell invoice-public" data-testid="public-invoice-page">
      <Seo title={t.title} description="QLeaves invoice" path={`/invoice/${orderNumber}`} noIndex />
      <div className="invoice-toolbar">
        <Link to="/" className="primary-button primary-button--secondary">{t.home}</Link>
        {invoice.data ? <button type="button" className="primary-button" onClick={() => window.print()}>{t.print}</button> : null}
      </div>
      {invoice.isPending && token ? <p role="status">{t.loading}</p> : null}
      {invoice.isError || !token ? <p role="alert">{t.missing}</p> : null}
      {invoice.data ? <InvoiceDocument order={invoice.data} language={language} /> : null}
    </section>
  );
}
