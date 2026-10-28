import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSiteLanguage } from "../../app/providers";
import { adminApi } from "./admin-api";

type RangeMode = "all" | "day" | "week" | "month";

function qatarToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const pick = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function reportRange(mode: RangeMode, reference: string): { from?: string; to?: string } {
  if (mode === "all") return {};
  const referenceDate = new Date(`${reference}T00:00:00Z`);

  if (mode === "day") {
    const to = new Date(referenceDate);
    to.setUTCDate(to.getUTCDate() + 1);
    return { from: reference, to: dateString(to) };
  }

  if (mode === "week") {
    const start = new Date(referenceDate);
    const weekday = start.getUTCDay();
    const daysFromMonday = (weekday + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysFromMonday);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { from: dateString(start), to: dateString(end) };
  }

  const start = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1));
  return { from: dateString(start), to: dateString(end) };
}

function formatDay(value: string, language: "en" | "ar"): string {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-QA" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

// The report's end date is exclusive, so the last day shown is the day before it.
function rangeLabel(range: { from?: string; to?: string }, language: "en" | "ar"): string | null {
  if (!range.from || !range.to) return null;
  const last = new Date(`${range.to}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() - 1);
  const end = dateString(last);
  return end === range.from ? formatDay(range.from, language) : `${formatDay(range.from, language)} – ${formatDay(end, language)}`;
}

export function AdminSalesPage() {
  const { content, language, isArabic } = useSiteLanguage();
  const t = isArabic
    ? { range: "الفترة", modes: { all: "الكل", day: "يوم", week: "أسبوع", month: "شهر" }, reference: "التاريخ المرجعي", allTime: "كل الفترات", loading: "جارٍ تحميل المبيعات…", error: "تعذر تحميل تقرير المبيعات.", orders: "الطلبات المكتملة", revenue: "الإيرادات", paid: "المدفوع", unpaid: "غير المدفوع", byDay: "المبيعات حسب اليوم", date: "التاريخ", count: "الطلبات", top: "الأكثر مبيعًا", noDays: "لا توجد طلبات مكتملة في هذه الفترة.", noItems: "لا توجد مبيعات مكتملة في هذه الفترة.", note: "يشمل التقرير الطلبات المكتملة فقط، بدون رسوم التوصيل." }
    : { range: "Range", modes: { all: "All", day: "Day", week: "Week", month: "Month" }, reference: "Reference date", allTime: "All time", loading: "Loading sales…", error: "Could not load the sales report.", orders: "Completed orders", revenue: "Revenue", paid: "Paid", unpaid: "Unpaid", byDay: "Sales by day", date: "Date", count: "Orders", top: "Top plants sold", noDays: "No completed orders in this range.", noItems: "No completed plant sales in this range.", note: "Only completed orders are counted. Delivery charges are excluded." };
  const [mode, setMode] = useState<RangeMode>("all");
  const [referenceDate, setReferenceDate] = useState(qatarToday);
  const range = useMemo(() => reportRange(mode, referenceDate), [mode, referenceDate]);
  const report = useQuery({
    queryKey: ["admin", "sales", range.from ?? "all", range.to ?? "all"],
    queryFn: () => adminApi.sales(range.from, range.to),
  });
  const metrics = report.data ? [
    [t.orders, String(report.data.orders)],
    [t.revenue, `QAR ${report.data.revenueQar}`],
    [t.paid, `QAR ${report.data.paidRevenueQar}`],
    [t.unpaid, `QAR ${report.data.unpaidRevenueQar}`],
  ] : [];

  return (
    <section className="page-shell admin-page" data-testid="admin-sales-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.sales}</p>
        <h1>{content.admin.sales}</h1>
        <p className="admin-page__lead">{t.note}</p>
      </div>

      <div className="admin-sales-controls">
        <div className="segmented" role="group" aria-label={t.range}>
          {(["all", "day", "week", "month"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)}>
              {t.modes[option]}
            </button>
          ))}
        </div>
        {mode !== "all" ? (
          <label className="admin-sales-controls__date">
            <span>{t.reference}</span>
            <input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value || qatarToday())} />
          </label>
        ) : null}
        <p className="admin-sales-controls__range" aria-live="polite">{rangeLabel(range, language) ?? t.allTime}</p>
      </div>

      {report.isPending ? <p className="admin-state" role="status">{t.loading}</p> : null}
      {report.isError ? <p className="admin-state" role="alert">{t.error}</p> : null}

      {report.data ? (
        <>
          <div className="metric-grid">
            {metrics.map(([label, value]) => (
              <article key={label} className="metric-card">
                <p>{label}</p>
                <strong>{value}</strong>
              </article>
            ))}
          </div>

          <div className="admin-sales-sections">
            <section className="admin-panel" aria-labelledby="sales-by-day">
              <h2 id="sales-by-day">{t.byDay}</h2>
              {report.data.byDay.length ? (
                <table className="admin-table">
                  <thead>
                    <tr><th scope="col">{t.date}</th><th scope="col">{t.count}</th><th scope="col">{t.revenue}</th></tr>
                  </thead>
                  <tbody>
                    {report.data.byDay.map((day) => (
                      <tr key={day.date}>
                        <td>{formatDay(day.date, language)}</td>
                        <td>{day.orders}</td>
                        <td>QAR {day.revenueQar}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="admin-empty">{t.noDays}</p>}
            </section>

            <section className="admin-panel" aria-labelledby="sales-top">
              <h2 id="sales-top">{t.top}</h2>
              {report.data.topItems.length ? (
                <ol className="admin-top-items">
                  {report.data.topItems.map((item) => (
                    <li key={item.name}>
                      <span>{item.name}</span>
                      <strong>{item.quantity}</strong>
                    </li>
                  ))}
                </ol>
              ) : <p className="admin-empty">{t.noItems}</p>}
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
