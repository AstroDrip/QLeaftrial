import { useQuery } from "@tanstack/react-query";
import { useSiteLanguage } from "../../app/providers";
import { adminApi } from "./admin-api";

export function AdminSalesPage() {
  const { content } = useSiteLanguage();
  const report = useQuery({ queryKey: ["admin", "sales"], queryFn: () => adminApi.sales() });
  return (
    <section className="page-shell admin-page" data-testid="admin-sales-page">
      <div className="page-shell__header"><p className="eyebrow">{content.admin.sales}</p><h1>{content.admin.sales}</h1></div>
      {report.isPending ? <p>{content.admin.loadingSales}</p> : null}
      {report.isError ? <p role="alert">{content.admin.loadSalesError}</p> : null}
      {report.data ? (
        <>
          <div className="metric-grid">
            <article className="metric-card"><p>{content.admin.completedOrders}</p><strong>{report.data.orders}</strong></article>
            <article className="metric-card"><p>{content.admin.revenue}</p><strong>QAR {report.data.revenueQar}</strong></article>
          </div>
          <div className="table-card">
            <table><thead><tr><th>{content.admin.date}</th><th>{content.admin.orders}</th><th>{content.admin.revenue}</th></tr></thead>
              <tbody>{report.data.byDay.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.orders}</td><td>QAR {day.revenueQar}</td></tr>)}</tbody>
            </table>
            {report.data.byDay.length === 0 ? <p>{content.admin.noCompleted}</p> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
