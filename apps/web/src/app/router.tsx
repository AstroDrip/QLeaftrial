import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { Layout } from "../components/Layout";
import { NotFoundPage } from "../components/NotFoundPage";
import { RouteErrorPage } from "../components/RouteErrorPage";
import { HomePage } from "../features/home/HomePage";
import { useSiteLanguage } from "./providers";

const AdminDashboardPage = lazy(() => import("../features/admin/AdminDashboardPage").then((module) => ({ default: module.AdminDashboardPage })));
const AdminLayout = lazy(() => import("../features/admin/AdminLayout").then((module) => ({ default: module.AdminLayout })));
const AdminLoginPage = lazy(() => import("../features/admin/AdminLoginPage").then((module) => ({ default: module.AdminLoginPage })));
const AdminOrdersPage = lazy(() => import("../features/admin/AdminOrdersPage").then((module) => ({ default: module.AdminOrdersPage })));
const AdminSalesPage = lazy(() => import("../features/admin/AdminSalesPage").then((module) => ({ default: module.AdminSalesPage })));
const AdminProductsPage = lazy(() => import("../features/admin/AdminProductsPage").then((module) => ({ default: module.AdminProductsPage })));
const CartPage = lazy(() => import("../features/cart/CartPage").then((module) => ({ default: module.CartPage })));
const CheckoutPage = lazy(() => import("../features/checkout/CheckoutPage").then((module) => ({ default: module.CheckoutPage })));
const OrderConfirmationPage = lazy(() => import("../features/checkout/OrderConfirmationPage").then((module) => ({ default: module.OrderConfirmationPage })));
const CatalogPage = lazy(() => import("../features/catalog/CatalogPage").then((module) => ({ default: module.CatalogPage })));
const ProductPage = lazy(() => import("../features/catalog/ProductPage").then((module) => ({ default: module.ProductPage })));
const PrivacyPage = lazy(() => import("../features/legal/LegalPages").then((module) => ({ default: module.PrivacyPage })));
const TermsPage = lazy(() => import("../features/legal/LegalPages").then((module) => ({ default: module.TermsPage })));
const ShippingReturnsPage = lazy(() => import("../features/legal/LegalPages").then((module) => ({ default: module.ShippingReturnsPage })));

function LoadingPage() {
  const { content } = useSiteLanguage();
  return <p className="page-shell" role="status" aria-live="polite">{content.common.loading}</p>;
}

const deferred = (element: ReactNode) => <Suspense fallback={<LoadingPage />}>{element}</Suspense>;

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "shop", element: deferred(<CatalogPage />) },
      { path: "plants/:slug", element: deferred(<ProductPage />) },
      { path: "cart", element: deferred(<CartPage />) },
      { path: "checkout", element: deferred(<CheckoutPage />) },
      { path: "order/:orderNumber", element: deferred(<OrderConfirmationPage />) },
      { path: "privacy", element: deferred(<PrivacyPage />) },
      { path: "terms", element: deferred(<TermsPage />) },
      { path: "shipping-returns", element: deferred(<ShippingReturnsPage />) },
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
      { path: "*", element: <Navigate to="/admin" replace /> },
    ],
  },
]);


