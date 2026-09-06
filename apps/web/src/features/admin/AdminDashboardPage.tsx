import { Link } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "./admin-api";

export function AdminDashboardPage() {
  const { content } = useSiteLanguage();
  const dashboard = useQuery({ queryKey: ["admin", "dashboard"], queryFn: adminApi.dashboard });
  const stats = dashboard.data ? [
    { label: content.admin.ordersToday, value: String(dashboard.data.ordersToday) },
    { label: content.admin.liveInventory, value: String(dashboard.data.liveInventory) },
    { label: content.admin.lowStock, value: String(dashboard.data.lowStock) },
    { label: content.admin.pendingPayouts, value: `QAR ${dashboard.data.pendingPayoutsQar}` },
  ] : [];
  return (
    <section className="page-shell admin-page" data-testid="admin-dashboard-page">
      <div className="page-shell__header">
        <p className="eyebrow">{content.admin.dashboard}</p>
        <h1>{content.admin.dashboard}</h1>
      </div>

      <div className="metric-grid">
        {stats.map((stat) => (
          <article key={stat.label} className="metric-card">
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </div>
      {dashboard.isPending ? <p>{content.admin.loadingDashboard}</p> : null}
      {dashboard.isError ? <p role="alert">{content.admin.loadDashboardError}</p> : null}

      <div className="admin-actions">
        <Link to="/admin/products" className="primary-button">
          {content.admin.products}
        </Link>
        <Link to="/admin/orders" className="primary-button primary-button--secondary">
          {content.admin.orders}
        </Link>
        <Link to="/admin/sales" className="primary-button primary-button--secondary">
          {content.admin.sales}
        </Link>
      </div>
    </section>
  );
}
