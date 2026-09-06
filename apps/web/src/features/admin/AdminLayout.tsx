import "./admin.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { adminApi } from "./admin-api";
import { Seo } from "../../components/Seo";

export function AdminLayout() {
  const { content, isArabic } = useSiteLanguage();
  const links = [
    { to: "/admin", label: content.admin.dashboard },
    { to: "/admin/products", label: content.admin.products },
    { to: "/admin/orders", label: content.admin.orders },
    { to: "/admin/sales", label: content.admin.sales },
  ];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ["admin", "session"], queryFn: adminApi.session, retry: false });
  const logout = useMutation({ mutationFn: adminApi.logout, onSuccess: () => { queryClient.removeQueries({ queryKey: ["admin"] }); navigate("/admin/login", { replace: true }); } });
  if (session.isPending) return <p className="admin-session-state">{content.admin.checking}</p>;
  if (session.isError) return <Navigate to="/admin/login" replace />;

  return (
    <div className="admin-shell" data-testid="admin-layout">
      <Seo title={content.nav.admin} description={isArabic ? "إدارة QLeaves." : "QLeaves administration."} path="/admin" noIndex />
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand"><span lang="en" dir="ltr">QLeaves</span> {content.nav.admin}</div>
        <nav aria-label={content.admin.navigation}>
          {links.map(({ to, label }) => (
            <NavLink key={to} to={to} className="admin-nav-link">
              {label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="admin-logout" onClick={() => logout.mutate()}>{content.admin.logout}</button>
      </aside>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
