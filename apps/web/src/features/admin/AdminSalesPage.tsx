import { useQuery } from "@tanstack/react-query";
import { content } from "../../content/en";
import { adminApi } from "./admin-api";

export function AdminSalesPage() {
  const report = useQuery({ queryKey: ["admin", "sales"], queryFn: () => adminApi.sales() });
  return (
    <section className="page-shell admin-page" data-testid="admin-sales-page">
      <div className="page-shell__header"><p className="eyebrow">{content.admin.sales}</p><h1>{content.admin.sales}</h1></div>
      {report.isPending ? <p>Loading sales…</p> : null}
      {report.isError ? <p role="alert">Could not load sales report.</p> : null}
      {report.data ? (
        <>
          <div className="metric-grid">
            <article className="metric-card"><p>Completed orders</p><strong>{report.data.orders}</strong></article>
            <article className="metric-card"><p>Revenue</p><strong>QAR {report.data.revenueQar}</strong></article>
          </div>
          <div className="table-card">
            <table><thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead>
              <tbody>{report.data.byDay.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.orders}</td><td>QAR {day.revenueQar}</td></tr>)}</tbody>
            </table>
            {report.data.byDay.length === 0 ? <p>No completed orders yet.</p> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
