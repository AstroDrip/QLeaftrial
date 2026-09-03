import { Link } from "react-router-dom";
import { content } from "../../content/en";

const stats = [
  { label: "Orders today", value: "48" },
  { label: "Live inventory", value: "213" },
  { label: "Low stock", value: "9" },
  { label: "Pending payouts", value: "QAR 8,460" },
];

export function AdminDashboardPage() {
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

      <div className="admin-actions">
        <Link to="/admin/products" className="primary-button">
          {content.admin.products}
        </Link>
        <Link to="/admin/orders" className="primary-button primary-button--secondary">
          {content.admin.orders}
        </Link>
      </div>
    </section>
  );
}
