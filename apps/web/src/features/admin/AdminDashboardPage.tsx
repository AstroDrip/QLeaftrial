import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStoreSettings, type StoreSettings } from "../../app/providers";
import { useSiteLanguage } from "../../app/providers";
import { adminApi } from "./admin-api";

export function AdminDashboardPage() {
  const { content, isArabic } = useSiteLanguage();
  const t = isArabic
    ? { ordersToday: "طلبات اليوم", inventory: "المخزون المتاح", lowStock: "مخزون منخفض", pending: "مدفوعات معلقة", loading: "جارٍ تحميل لوحة التحكم…", loadError: "تعذر تحميل لوحة التحكم.", orderingTitle: "الطلب من المتجر", orderingBody: "أوقف الطلبات لإخفاء الأسعار وأزرار السلة من المتجر.", settingsLoading: "جارٍ تحميل إعدادات المتجر…", settingsError: "تعذر تحميل إعدادات المتجر.", orderingError: "تعذر تحديث حالة الطلبات.", enabled: "الطلبات مفعّلة", disabled: "الطلبات متوقفة", businessTitle: "بيانات النشاط والتوصيل", businessBody: "أدخل بيانات النشاط التجاري الموثقة ورسوم التوصيل التي يراها العملاء عند الدفع.", gatewayNote: "اختيار رابط الدفع ليس ربطًا ببوابة دفع. اربط مزود دفع مرخصًا في قطر وتحقق منه قبل الإطلاق.", businessError: "تعذر حفظ بيانات النشاط.", cr: "رقم السجل التجاري", license: "رقم ترخيص التجارة الإلكترونية", address: "العنوان المسجل", email: "بريد خدمة العملاء", phone: "هاتف خدمة العملاء في قطر", fee: "رسوم التوصيل (ر.ق)", feeWarning: "حدد رسوم التوصيل حتى يتمكن العملاء من الطلب.", saving: "جارٍ الحفظ…", save: "حفظ بيانات النشاط", sheetTitle: "جدول Google", sheetBody: "تُضاف الطلبات الجديدة وتُحدَّث تلقائيًا في جدول Google. يمكنك مزامنة كل الطلبات يدويًا في أي وقت.", sheetOff: "غير مفعّل بعد. أضف بيانات حساب الخدمة في إعدادات الخادم (انظر دليل النشر).", sheetOpen: "فتح الجدول", sheetSync: "مزامنة كل الطلبات الآن", sheetSyncing: "جارٍ المزامنة…", sheetDone: (count: number) => `تمت مزامنة ${count} طلب.`, sheetFailed: "تعذرت المزامنة. تحقق من مشاركة الجدول مع حساب الخدمة ثم حاول مجددًا.", sheetOn: (tab: string) => `متصل بالورقة "${tab}".` }
    : { ordersToday: "Orders today", inventory: "Live inventory", lowStock: "Low stock", pending: "Pending payouts", loading: "Loading dashboard…", loadError: "Could not load dashboard.", orderingTitle: "Storefront ordering", orderingBody: "Turn off ordering to hide prices and cart controls from the storefront.", settingsLoading: "Loading storefront settings…", settingsError: "Could not load storefront settings.", orderingError: "Could not update storefront ordering.", enabled: "Ordering enabled", disabled: "Ordering disabled", businessTitle: "Business details and delivery", businessBody: "Enter verified business information and the delivery charge customers will see at checkout.", gatewayNote: "Payment-link selection is not a payment-gateway integration. Connect and verify your Qatar-licensed provider separately before launch.", businessError: "Could not save business details.", cr: "Commercial Registration (CR) number", license: "E-commerce license number", address: "Registered business address", email: "Customer service email", phone: "Qatar customer service phone", fee: "Delivery charge (QAR)", feeWarning: "Set a delivery charge before customers can place orders.", saving: "Saving…", save: "Save business details", sheetTitle: "Google Sheet", sheetBody: "New orders and every change are added to your Google Sheet automatically. You can also sync all orders by hand at any time.", sheetOff: "Not set up yet. Add the service-account details in the server settings (see the deployment guide).", sheetOpen: "Open sheet", sheetSync: "Sync all orders now", sheetSyncing: "Syncing…", sheetDone: (count: number) => `Synced ${count} order${count === 1 ? "" : "s"}.`, sheetFailed: "The sync failed. Check that the sheet is shared with the service account, then try again.", sheetOn: (tab: string) => `Connected to the "${tab}" tab.` };
  const sheets = useQuery({ queryKey: ["admin", "sheets"], queryFn: adminApi.sheetsStatus, retry: false });
  const syncSheets = useMutation({ mutationFn: adminApi.syncSheets });
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
    { label: t.ordersToday, value: String(dashboard.data.ordersToday) },
    { label: t.inventory, value: String(dashboard.data.liveInventory) },
    { label: t.lowStock, value: String(dashboard.data.lowStock) },
    { label: t.pending, value: `QAR ${dashboard.data.pendingPayoutsQar}` },
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
      {dashboard.isPending ? <p className="admin-state" role="status">{t.loading}</p> : null}
      {dashboard.isError ? <p className="admin-state" role="alert">{t.loadError}</p> : null}

      <section className="admin-store-settings" aria-labelledby="ordering-setting-title">
        <div>
          <h2 id="ordering-setting-title">{t.orderingTitle}</h2>
          <p>{t.orderingBody}</p>
        </div>
        {settings.isPending ? <p role="status">{t.settingsLoading}</p> : null}
        {settings.isError ? <p role="alert">{t.settingsError}</p> : null}
        {updateOrdering.isError ? <p role="alert">{t.orderingError}</p> : null}
        {settings.data ? (
          <label className="admin-ordering-toggle">
            <input
              type="checkbox"
              checked={settings.data.orderingEnabled}
              disabled={updateOrdering.isPending}
              onChange={(event) => updateOrdering.mutate(event.target.checked)}
            />
            <span>{settings.data.orderingEnabled ? t.enabled : t.disabled}</span>
          </label>
        ) : null}
      </section>

      <section className="admin-sheet-sync" aria-labelledby="sheet-sync-title">
        <div>
          <h2 id="sheet-sync-title">{t.sheetTitle}</h2>
          <p>{t.sheetBody}</p>
          {sheets.isSuccess ? <p className="admin-sheet-sync__status">{sheets.data.configured ? t.sheetOn(sheets.data.tab ?? "Orders") : t.sheetOff}</p> : null}
          {syncSheets.isSuccess ? <p role="status" className="admin-sheet-sync__ok">{t.sheetDone(syncSheets.data.synced)}</p> : null}
          {syncSheets.isError ? <p role="alert" className="admin-sheet-sync__error">{t.sheetFailed}</p> : null}
        </div>
        {sheets.data?.configured ? (
          <div className="admin-actions">
            {sheets.data.sheetUrl ? <a className="primary-button primary-button--secondary" href={sheets.data.sheetUrl} target="_blank" rel="noreferrer">{t.sheetOpen}</a> : null}
            <button type="button" className="primary-button" disabled={syncSheets.isPending} onClick={() => syncSheets.mutate()}>{syncSheets.isPending ? t.sheetSyncing : t.sheetSync}</button>
          </div>
        ) : null}
      </section>

      <section className="admin-business-settings" aria-labelledby="business-setting-title">
        <div>
          <h2 id="business-setting-title">{t.businessTitle}</h2>
          <p>{t.businessBody}</p>
          <p>{t.gatewayNote}</p>
        </div>
        {updateBusiness.isError ? <p role="alert">{t.businessError}</p> : null}
        <form
          className="admin-business-settings__form"
          onSubmit={(event) => {
            event.preventDefault();
            updateBusiness.mutate(business);
          }}
        >
          <label>{t.cr}
            <input value={business.commercialRegistration ?? ""} onChange={(event) => setBusiness({ ...business, commercialRegistration: event.target.value || null })} />
          </label>
          <label>{t.license}
            <input value={business.ecommerceLicense ?? ""} onChange={(event) => setBusiness({ ...business, ecommerceLicense: event.target.value || null })} />
          </label>
          <label>{t.address}
            <input value={business.businessAddress ?? ""} onChange={(event) => setBusiness({ ...business, businessAddress: event.target.value || null })} />
          </label>
          <label>{t.email}
            <input type="email" value={business.supportEmail ?? ""} onChange={(event) => setBusiness({ ...business, supportEmail: event.target.value || null })} />
          </label>
          <label>{t.phone}
            <input type="tel" value={business.supportPhone ?? ""} onChange={(event) => setBusiness({ ...business, supportPhone: event.target.value || null })} />
          </label>
          <label>{t.fee}
            <input type="number" min="0" step="1" required value={business.deliveryFeeQar ?? ""} onChange={(event) => setBusiness({ ...business, deliveryFeeQar: event.target.value === "" ? null : Number(event.target.value) })} />
          </label>
          {business.deliveryFeeQar === null ? <p className="admin-business-settings__warning">{t.feeWarning}</p> : null}
          <button type="submit" className="primary-button" disabled={updateBusiness.isPending}>
            {updateBusiness.isPending ? t.saving : t.save}
          </button>
        </form>
      </section>

    </section>
  );
}
