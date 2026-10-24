import "./admin.css";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useSiteLanguage } from "../../app/providers";
import { adminApi } from "./admin-api";
import { Seo } from "../../components/Seo";

export function AdminLayout() {
  const { content, isArabic } = useSiteLanguage();
  const links = [
    { to: "/admin", label: content.admin.dashboard, index: "01", end: true },
    { to: "/admin/orders", label: content.admin.orders, index: "02", end: false },
    { to: "/admin/products", label: content.admin.products, index: "03", end: false },
    { to: "/admin/sales", label: content.admin.sales, index: "04", end: false },
  ] as const;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const session = useQuery({
    queryKey: ["admin", "session"],
    queryFn: adminApi.session,
    retry: false,
  });
  const logout = useMutation({
    mutationFn: adminApi.logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["admin"] });
      navigate("/admin/login", { replace: true });
    },
  });

  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.removeQueries({ queryKey: ["admin"] });
      navigate("/admin/login", { replace: true });
    };
    window.addEventListener("qleaves:admin-unauthorized", handleUnauthorized);
    return () => window.removeEventListener("qleaves:admin-unauthorized", handleUnauthorized);
  }, [navigate, queryClient]);

  useEffect(() => {
    if (!navigationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavigationOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navigationOpen]);

  if (session.isPending) {
    return <p className="admin-session-state">{content.admin.checking}</p>;
  }
  if (session.isError) return <Navigate to="/admin/login" replace />;

  function refreshAdminData() {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["product"] });
    queryClient.invalidateQueries({ queryKey: ["catalog-filters"] });
  }

  return (
    <div className="admin-shell" data-testid="admin-layout">
      <Seo title={content.nav.admin} description={isArabic ? "إدارة QLeaves." : "QLeaves administration."} path="/admin" noIndex />

      <button
        type="button"
        className={navigationOpen ? "admin-backdrop is-visible" : "admin-backdrop"}
        aria-label="Close admin navigation"
        tabIndex={navigationOpen ? 0 : -1}
        onClick={() => setNavigationOpen(false)}
      />

      <aside
        id="admin-navigation"
        className={navigationOpen ? "admin-sidebar is-open" : "admin-sidebar"}
      >
        <div className="admin-sidebar__head">
          <div>
            <div className="admin-sidebar__brand"><span lang="en" dir="ltr">QLeaves</span></div>
            <span>{content.nav.admin}</span>
          </div>
          <button
            type="button"
            className="admin-sidebar__close"
            aria-label="Close navigation"
            onClick={() => setNavigationOpen(false)}
          >
            ×
          </button>
        </div>

        <nav aria-label={content.admin.navigation}>
          {links.map(({ to, label, index, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="admin-nav-link"
              onClick={() => setNavigationOpen(false)}
            >
              <span className="admin-nav-index">{index}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar__footer">
          <span>Signed in as {session.data.name}</span>
          <button
            type="button"
            className="admin-logout"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            {logout.isPending ? "Signing out…" : content.admin.logout}
          </button>
        </div>
      </aside>

      <main className="admin-content">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-icon-button admin-menu-button"
            aria-label="Open admin navigation"
            aria-controls="admin-navigation"
            aria-expanded={navigationOpen}
            onClick={() => setNavigationOpen(true)}
          >
            <span aria-hidden="true">☰</span>
          </button>

          <div className="admin-topbar__title">
            <strong>QLeaves</strong>
            <span>Admin dashboard</span>
          </div>

          <button
            type="button"
            className="admin-icon-button"
            aria-label="Refresh admin data"
            title="Refresh admin data"
            onClick={refreshAdminData}
          >
            <span aria-hidden="true">↻</span>
          </button>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
