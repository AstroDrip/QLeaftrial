import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { content } from "../../content/en";
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

export function AdminSalesPage() {
  const [mode, setMode] = useState<RangeMode>("all");
  const [referenceDate, setReferenceDate] = useState(qatarToday);
  const range = useMemo(() => reportRange(mode, referenceDate), [mode, referenceDate]);
  const report = useQuery({
    queryKey: ["admin", "sales", range.from ?? "all", range.to ?? "all"],
    queryFn: () => adminApi.sales(range.from, range.to),
  });

  return (
    <section className="page-shell admin-page" data-testid="admin-sales-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.sales}</p>
        <h1>{content.admin.sales}</h1>
      </div>

      <div className="admin-order-toolbar">
        <div className="admin-order-tabs" role="group" aria-label="Sales date range">
          {(["all", "day", "week", "month"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={mode === option
                ? "primary-button"
                : "primary-button primary-button--secondary"}
              aria-selected={mode === option}
              onClick={() => setMode(option)}
            >
              <span className="admin-order-tab__full">
                {option[0].toUpperCase()}{option.slice(1)}
              </span>
              <span className="admin-order-tab__short" aria-hidden="true">
                {option[0].toUpperCase()}
              </span>
            </button>
          ))}
        </div>

        {mode !== "all" ? (
          <label>
            <span className="eyebrow">Reference date</span>
            <input
              type="date"
              value={referenceDate}
              onChange={(event) => setReferenceDate(event.target.value)}
            />
          </label>
        ) : null}
      </div>

      {report.isPending ? <p>Loading sales…</p> : null}
      {report.isError ? <p role="alert">Could not load sales report.</p> : null}

      {report.data ? (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <p>Completed orders</p>
              <strong>{report.data.orders}</strong>
            </article>
            <article className="metric-card">
              <p>Revenue</p>
              <strong>QAR {report.data.revenueQar}</strong>
            </article>
            <article className="metric-card">
              <p>Paid</p>
              <strong>QAR {report.data.paidRevenueQar}</strong>
            </article>
            <article className="metric-card">
              <p>Unpaid</p>
              <strong>QAR {report.data.unpaidRevenueQar}</strong>
            </article>
          </div>

          <div className="admin-sales-sections">
            <div className="table-card">
              <h2>Sales by day</h2>
              <table>
                <thead>
                  <tr><th>Date</th><th>Orders</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {report.data.byDay.map((day) => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td>{day.orders}</td>
                      <td>QAR {day.revenueQar}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.data.byDay.length === 0 ? <p>No completed orders in this range.</p> : null}
            </div>

            <div className="table-card">
              <h2>Top plants sold</h2>
              {report.data.topItems.length ? (
                <ol className="admin-top-items">
                  {report.data.topItems.map((item) => (
                    <li key={item.name}>
                      <span>{item.name}</span>
                      <strong>{item.quantity}</strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No completed item sales in this range.</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
