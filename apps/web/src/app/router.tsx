import {
  createBrowserRouter,
  Navigate,
} from "react-router-dom";
import { Layout } from "../components/Layout";
import { NotFoundPage } from "../components/NotFoundPage";
import { AdminDashboardPage } from "../features/admin/AdminDashboardPage";
import { AdminLayout } from "../features/admin/AdminLayout";
import { AdminLoginPage } from "../features/admin/AdminLoginPage";
import { AdminOrdersPage } from "../features/admin/AdminOrdersPage";
import { AdminProductsPage } from "../features/admin/AdminProductsPage";
import { CartPage } from "../features/cart/CartPage";
import { CheckoutPage } from "../features/checkout/CheckoutPage";
import { OrderConfirmationPage } from "../features/checkout/OrderConfirmationPage";
import { CatalogPage } from "../features/catalog/CatalogPage";
import { ProductPage } from "../features/catalog/ProductPage";
import { HomePage } from "../features/home/HomePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "shop", element: <CatalogPage /> },
      { path: "plants/:slug", element: <ProductPage /> },
      { path: "cart", element: <CartPage /> },
      { path: "checkout", element: <CheckoutPage /> },
      { path: "order/:orderNumber", element: <OrderConfirmationPage /> },
    ],
  },
  { path: "/admin/login", element: <AdminLoginPage /> },
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: "products", element: <AdminProductsPage /> },
      { path: "orders", element: <AdminOrdersPage /> },
      { path: "*", element: <Navigate to="/admin" replace /> },
    ],
  },
    { path: "*", element: <NotFoundPage /> },
]);

