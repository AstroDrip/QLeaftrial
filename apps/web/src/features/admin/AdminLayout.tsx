import { NavLink, Outlet } from "react-router-dom";
import { content } from "../../content/en";

const links = [
  { to: "/admin", label: content.admin.dashboard },
  { to: "/admin/products", label: content.admin.products },
  { to: "/admin/orders", label: content.admin.orders },
];

export function AdminLayout() {
  return (
    <div className="admin-shell" data-testid="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">QLeaves Admin</div>
        <nav aria-label="Admin navigation">
          {links.map(({ to, label }) => (
            <NavLink key={to} to={to} className="admin-nav-link">
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
