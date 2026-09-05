export interface AdminSession { name: string }
export interface AdminProduct { id: string; slug: string; name: string; nameAr?: string | null; descriptionAr?: string | null; categoryAr?: string | null; lightAr?: string | null; priceQar: number; stock: number }
export interface CreateAdminProductInput { name: string; nameAr?: string; slug: string; sku: string; description: string; descriptionAr?: string; category: string; categoryAr?: string; light: string; lightAr?: string; priceQar: number; costPrice: number; stock: number; imageDataUrl: string; imageAltText: string }
export interface AdminOrder { id: string; orderNumber: string; customerName: string; phone: string; email: string; addressLine1: string; area: string; deliveryNotes?: string | null; subtotalQar: number; status: string; paymentStatus: string; createdAt: string; items: Array<{ productName: string; quantity: number; unitPriceQar: number }> }
export interface AdminDashboard { ordersToday: number; liveInventory: number; lowStock: number; pendingPayoutsQar: number }
export interface AdminSalesReport { orders: number; revenueQar: number; byDay: Array<{ date: string; orders: number; revenueQar: number }> }

const BASE_URL = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Request failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const adminApi = {
  login: async (password: string): Promise<AdminSession> => (await request<{ admin: AdminSession }>("/auth/login", { method: "POST", body: JSON.stringify({ password }) })).admin,
  session: async (): Promise<AdminSession> => (await request<{ admin: AdminSession }>("/auth/session")).admin,
  logout: (): Promise<void> => request<void>("/auth/logout", { method: "POST" }),
  products: async (): Promise<AdminProduct[]> => (await request<{ items: AdminProduct[] }>("/admin/products")).items,
  createProduct: (input: CreateAdminProductInput): Promise<AdminProduct> => request<AdminProduct>("/admin/products", { method: "POST", body: JSON.stringify(input) }),
  updateProduct: (id: string, patch: { priceQar?: number; stock?: number; nameAr?: string; descriptionAr?: string; categoryAr?: string; lightAr?: string }): Promise<AdminProduct> => request<AdminProduct>(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  orders: async (): Promise<AdminOrder[]> => (await request<{ items: AdminOrder[] }>("/admin/orders")).items,
  updateOrderStatus: (id: string, status: string) => request<AdminOrder>(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  updatePaymentStatus: (id: string, paymentStatus: string) => request<AdminOrder>(`/admin/orders/${id}/payment`, { method: "PATCH", body: JSON.stringify({ paymentStatus }) }),
  deleteOrder: (id: string): Promise<void> => request<void>(`/admin/orders/${id}`, { method: "DELETE" }),
  deleteOrders: (ids: string[]): Promise<{ deleted: number }> => request<{ deleted: number }>("/admin/orders/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) }),
  dashboard: (): Promise<AdminDashboard> => request<AdminDashboard>("/admin/dashboard"),
  sales: (from?: string, to?: string): Promise<AdminSalesReport> => request<AdminSalesReport>(`/admin/sales${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ""}`),
};
