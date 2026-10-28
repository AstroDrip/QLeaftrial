import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { adminApi } from "./admin-api";
import { filterInvoices, groupByDay, invoiceNumber, invoiceTotal, invoiceTotals, type PaymentFilter } from "./invoice-utils";
import "./invoice.css";

const copy = {
  en: {
    lead: "One invoice per order, grouped by the day it was placed (Qatar time). Declined orders are not listed.",
    payment: "Payment", modes: { all: "All", paid: "Paid", unpaid: "Unpaid" } as Record<PaymentFilter, string>, from: "From", to: "To", clear: "Clear dates",
    invoices: "Invoices", total: "Total", paid: "Paid", unpaid: "Unpaid", view: "View / print", loading: "Loading invoices…", error: "Could not load invoices.",
    empty: "No invoices match these filters.", status: { PAID: "Paid", PENDING: "Pending", FAILED: "Failed" } as Record<string, string>,
  },
  ar: {
    lead: "فاتورة لكل طلب، مجمّعة حسب يوم الطلب (بتوقيت قطر). لا تظهر الطلبات المرفوضة.",
    payment: "الدفع", modes: { all: "الكل", paid: "مدفوع", unpaid: "غير مدفوع" } as Record<PaymentFilter, string>, from: "من", to: "إلى", clear: "مسح التواريخ",
    invoices: "الفواتير", total: "الإجمالي", paid: "المدفوع", unpaid: "غير المدفوع", view: "عرض / طباعة", loading: "جارٍ تحميل الفواتير…", error: "تعذر تحميل الفواتير.",
    empty: "لا توجد فواتير مطابقة لهذه الفلاتر.", status: { PAID: "مدفوع", PENDING: "معلق", FAILED: "فشل" } as Record<string, string>,
  },
};

function formatDay(day: string, language: "en" | "ar"): string {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-QA-u-nu-latn" : "en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${day}T00:00:00Z`));
}

export function AdminInvoicesPage() {
  const { content, language } = useSiteLanguage();
  const t = copy[language];
  const [payment, setPayment] = useState<PaymentFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const orders = useQuery({ queryKey: ["admin", "orders"], queryFn: adminApi.orders });
  const invoices = useMemo(() => filterInvoices(orders.data ?? [], { from: from || undefined, to: to || undefined, payment }), [orders.data, from, to, payment]);
  const days = useMemo(() => groupByDay(invoices), [invoices]);
  const totals = useMemo(() => invoiceTotals(invoices), [invoices]);
  const metrics: Array<[string, string]> = [[t.invoices, String(totals.count)], [t.total, `QAR ${totals.totalQar}`], [t.paid, `QAR ${totals.paidQar}`], [t.unpaid, `QAR ${totals.unpaidQar}`]];

  return (
    <section className="page-shell admin-page" data-testid="admin-invoices-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.invoices}</p>
        <h1>{content.admin.invoices}</h1>
        <p className="admin-page__lead">{t.lead}</p>
      </div>

      <div className="invoice-filters">
        <div className="segmented" role="group" aria-label={t.payment}>
          {(["all", "paid", "unpaid"] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={payment === mode} onClick={() => setPayment(mode)}>{t.modes[mode]}</button>
          ))}
        </div>
        <label>{t.from}<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>{t.to}<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
        {from || to ? <button type="button" className="primary-button primary-button--secondary" onClick={() => { setFrom(""); setTo(""); }}>{t.clear}</button> : null}
      </div>

      {orders.isPending ? <p className="admin-state" role="status">{t.loading}</p> : null}
      {orders.isError ? <p className="admin-state" role="alert">{t.error}</p> : null}

      {orders.isSuccess ? (
        <>
          <div className="metric-grid">
            {metrics.map(([label, value]) => <article key={label} className="metric-card"><p>{label}</p><strong>{value}</strong></article>)}
          </div>
          {days.length === 0 ? <p className="admin-empty">{t.empty}</p> : null}
          {days.map((group) => (
            <section key={group.day} className="invoice-day" aria-label={formatDay(group.day, language)}>
              <div className="invoice-day__head"><h2>{formatDay(group.day, language)}</h2><span>QAR {group.totalQar}</span></div>
              <ul className="invoice-rows">
                {group.orders.map((order) => (
                  <li key={order.id} className="invoice-row">
                    <span className="invoice-row__number" dir="ltr">{invoiceNumber(order)}</span>
                    <span>{order.customerName}</span>
                    <span className="status-pill">{t.status[order.paymentStatus] ?? order.paymentStatus}</span>
                    <span className="invoice-row__total">QAR {invoiceTotal(order)}</span>
                    <Link to={`/admin/invoices/${order.id}`} className="primary-button primary-button--secondary">{t.view}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : null}
    </section>
  );
}
