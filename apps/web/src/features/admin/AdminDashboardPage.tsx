import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStoreSettings, type StoreSettings } from "../../app/providers";
import { useSiteLanguage } from "../../app/providers";
import { adminApi } from "./admin-api";

export function AdminDashboardPage() {
  const { content } = useSiteLanguage();
  const dashboard = useQuery({ queryKey: ["admin", "dashboard"], queryFn: adminApi.dashboard });
  const settings = useStoreSettings();
  const queryClient = useQueryClient();
  const updateOrdering = useMutation({
    mutationFn: adminApi.updateOrderingEnabled,
    onSuccess: (updated) => {
      queryClient.setQueryData(["storefront-settings"], updated);
    },
  });
  const updateBusiness = useMutation({
    mutationFn: adminApi.updateBusinessSettings,
    onSuccess: (updated) => queryClient.setQueryData(["storefront-settings"], updated),
  });
  const [business, setBusiness] = useState<Omit<StoreSettings, "orderingEnabled">>({
    commercialRegistration: null,
    ecommerceLicense: null,
    businessAddress: null,
    supportEmail: null,
    supportPhone: null,
    deliveryFeeQar: null,
  });
  useEffect(() => {
    if (!settings.data) return;
    const { orderingEnabled: _orderingEnabled, ...details } = settings.data;
    setBusiness(details);
  }, [settings.data]);
  const stats = dashboard.data ? [
    { label: "Orders today", value: String(dashboard.data.ordersToday) },
    { label: "Live inventory", value: String(dashboard.data.liveInventory) },
    { label: "Low stock", value: String(dashboard.data.lowStock) },
    { label: "Pending payouts", value: `QAR ${dashboard.data.pendingPayoutsQar}` },
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
      {dashboard.isPending ? <p>Loading dashboard…</p> : null}
      {dashboard.isError ? <p role="alert">Could not load dashboard.</p> : null}

      <section className="admin-store-settings" aria-labelledby="ordering-setting-title">
        <div>
          <h2 id="ordering-setting-title">Storefront ordering</h2>
          <p>Turn off ordering to hide prices and cart controls from the storefront.</p>
        </div>
        {settings.isPending ? <p role="status">Loading storefront settings…</p> : null}
        {settings.isError ? <p role="alert">Could not load storefront settings.</p> : null}
        {updateOrdering.isError ? <p role="alert">Could not update storefront ordering.</p> : null}
        {settings.data ? (
          <label className="admin-ordering-toggle">
            <input
              type="checkbox"
              checked={settings.data.orderingEnabled}
              disabled={updateOrdering.isPending}
              onChange={(event) => updateOrdering.mutate(event.target.checked)}
            />
            <span>{settings.data.orderingEnabled ? "Ordering enabled" : "Ordering disabled"}</span>
          </label>
        ) : null}
      </section>

      <section className="admin-business-settings" aria-labelledby="business-setting-title">
        <div>
          <h2 id="business-setting-title">Business details and delivery</h2>
          <p>Enter verified business information and the delivery charge customers will see at checkout.</p>
          <p>Payment-link selection is not a payment-gateway integration. Connect and verify your Qatar-licensed provider separately before launch.</p>
        </div>
        {updateBusiness.isError ? <p role="alert">Could not save business details.</p> : null}
        <form
          className="admin-business-settings__form"
          onSubmit={(event) => {
            event.preventDefault();
            updateBusiness.mutate(business);
          }}
        >
          <label>Commercial Registration (CR) number
            <input value={business.commercialRegistration ?? ""} onChange={(event) => setBusiness({ ...business, commercialRegistration: event.target.value || null })} />
          </label>
          <label>E-commerce license number
            <input value={business.ecommerceLicense ?? ""} onChange={(event) => setBusiness({ ...business, ecommerceLicense: event.target.value || null })} />
          </label>
          <label>Registered business address
            <input value={business.businessAddress ?? ""} onChange={(event) => setBusiness({ ...business, businessAddress: event.target.value || null })} />
          </label>
          <label>Customer service email
            <input type="email" value={business.supportEmail ?? ""} onChange={(event) => setBusiness({ ...business, supportEmail: event.target.value || null })} />
          </label>
          <label>Qatar customer service phone
            <input type="tel" value={business.supportPhone ?? ""} onChange={(event) => setBusiness({ ...business, supportPhone: event.target.value || null })} />
          </label>
          <label>Delivery charge (QAR)
            <input type="number" min="0" step="1" required value={business.deliveryFeeQar ?? ""} onChange={(event) => setBusiness({ ...business, deliveryFeeQar: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
          {business.deliveryFeeQar === null ? <p className="admin-business-settings__warning">Set a delivery charge before customers can place orders.</p> : null}
          <button type="submit" className="primary-button" disabled={updateBusiness.isPending}>
            {updateBusiness.isPending ? "Saving…" : "Save business details"}
          </button>
        </form>
      </section>

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
