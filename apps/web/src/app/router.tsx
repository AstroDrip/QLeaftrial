import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { Layout } from "../components/Layout";
import { NotFoundPage } from "../components/NotFoundPage";
import { RouteErrorPage } from "../components/RouteErrorPage";
import { HomePage } from "../features/home/HomePage";
import { useSiteLanguage, useStoreSettings } from "./providers";
import { loadCart, loadCatalog, loadCheckout, loadConfirmation, loadLegal, loadProduct } from "./route-modules";

const AdminDashboardPage = lazy(() => import("../features/admin/AdminDashboardPage").then((module) => ({ default: module.AdminDashboardPage })));
const AdminLayout = lazy(() => import("../features/admin/AdminLayout").then((module) => ({ default: module.AdminLayout })));
const AdminLoginPage = lazy(() => import("../features/admin/AdminLoginPage").then((module) => ({ default: module.AdminLoginPage })));
const AdminOrdersPage = lazy(() => import("../features/admin/AdminOrdersPage").then((module) => ({ default: module.AdminOrdersPage })));
const AdminSalesPage = lazy(() => import("../features/admin/AdminSalesPage").then((module) => ({ default: module.AdminSalesPage })));
const AdminInvoicesPage = lazy(() => import("../features/admin/AdminInvoicesPage").then((module) => ({ default: module.AdminInvoicesPage })));
const AdminInvoicePage = lazy(() => import("../features/admin/AdminInvoicePage").then((module) => ({ default: module.AdminInvoicePage })));
const AdminProductsPage = lazy(() => import("../features/admin/AdminProductsPage").then((module) => ({ default: module.AdminProductsPage })));
const CartPage = lazy(() => loadCart().then((module) => ({ default: module.CartPage })));
const CheckoutPage = lazy(() => loadCheckout().then((module) => ({ default: module.CheckoutPage })));
const OrderConfirmationPage = lazy(() => loadConfirmation().then((module) => ({ default: module.OrderConfirmationPage })));
const CatalogPage = lazy(() => loadCatalog().then((module) => ({ default: module.CatalogPage })));
const ProductPage = lazy(() => loadProduct().then((module) => ({ default: module.ProductPage })));
const PrivacyPage = lazy(() => loadLegal().then((module) => ({ default: module.PrivacyPage })));
const TermsPage = lazy(() => loadLegal().then((module) => ({ default: module.TermsPage })));
const ShippingReturnsPage = lazy(() => loadLegal().then((module) => ({ default: module.ShippingReturnsPage })));
const AboutPage = lazy(() => loadLegal().then((module) => ({ default: module.AboutPage })));

function LoadingPage() {
  const { content } = useSiteLanguage();
  return <p className="page-shell" role="status" aria-live="polite">{content.common.loading}</p>;
}

const deferred = (element: ReactNode) => <Suspense fallback={<LoadingPage />}>{element}</Suspense>;

function OrderingRoute({ children }: { children: ReactNode }) {
  const settings = useStoreSettings();
  const { isArabic } = useSiteLanguage();
  if (settings.isPending) return <p className="page-shell" role="status">{isArabic ? "جارٍ تحميل إعدادات المتجر…" : "Loading storefront settings…"}</p>;
  if (settings.isError) return <p className="page-shell" role="alert">{isArabic ? "تعذر تحميل إعدادات المتجر. حاول مرة أخرى." : "Storefront settings could not be loaded. Please try again."}</p>;
  if (!settings.data.orderingEnabled) return <Navigate to="/shop" replace />;
  return children;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "shop", element: deferred(<CatalogPage />) },
      { path: "plants/:slug", element: deferred(<ProductPage />) },
      { path: "cart", element: deferred(<OrderingRoute><CartPage /></OrderingRoute>) },
      { path: "checkout", element: deferred(<OrderingRoute><CheckoutPage /></OrderingRoute>) },
      { path: "order/:orderNumber", element: deferred(<OrderConfirmationPage />) },
      { path: "privacy", element: deferred(<PrivacyPage />) },
      { path: "terms", element: deferred(<TermsPage />) },
      { path: "shipping-returns", element: deferred(<ShippingReturnsPage />) },
      { path: "about", element: deferred(<AboutPage />) },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  { path: "/admin/login", element: deferred(<AdminLoginPage />), errorElement: <RouteErrorPage /> },
  {
    path: "/admin",
    element: deferred(<AdminLayout />),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: deferred(<AdminDashboardPage />) },
      { path: "products", element: deferred(<AdminProductsPage />) },
      { path: "orders", element: deferred(<AdminOrdersPage />) },
      { path: "sales", element: deferred(<AdminSalesPage />) },
      { path: "invoices", element: deferred(<AdminInvoicesPage />) },
      { path: "invoices/:orderId", element: deferred(<AdminInvoicePage />) },
      { path: "*", element: <Navigate to="/admin" replace /> },
    ],
  },
]);
