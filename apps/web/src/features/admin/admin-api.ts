import { errorFromResponse } from "../../lib/api-error";
import { createProductImageVariants, type ProductImageVariant } from "./product-image-variants";

export interface AdminSession { name: string }
export interface AdminProduct { id: string; slug: string; name: string; nameAr?: string | null; descriptionAr?: string | null; categoryAr?: string | null; lightAr?: string | null; priceQar: number; stock: number }
export interface CreateAdminProductFields { name: string; nameAr: string; slug: string; sku: string; description: string; descriptionAr: string; category: string; categoryAr: string; light: string; lightAr: string; priceQar: number; costPrice: number; stock: number; imageAltText: string }
export interface StagedProductImage { stagingPath: string; purpose: "catalog" | "detail"; contentType: "image/webp"; byteSize: number; width: number; height: number }
export type CreateAdminProductInput = CreateAdminProductFields & { imageDataUrl?: string; stagedImages?: StagedProductImage[] };
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
    throw await errorFromResponse(response);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The selected product image could not be read."));
    });
    reader.addEventListener("error", () => reject(new Error("The selected product image could not be read.")));
    reader.readAsDataURL(file);
  });
}

async function authorizeVariant(variant: ProductImageVariant): Promise<{
  path: string;
  token: string;
  uploadUrl: string;
}> {
  return request("/admin/product-uploads", {
    method: "POST",
    body: JSON.stringify({
      purpose: variant.purpose,
      contentType: variant.contentType,
      byteSize: variant.byteSize,
      width: variant.width,
      height: variant.height,
    }),
  });
}

async function uploadVariant(variant: ProductImageVariant): Promise<StagedProductImage> {
  const authorization = await authorizeVariant(variant);
  const form = new FormData();
  form.append("cacheControl", "31536000");
  form.append("", variant.blob);
  const response = await fetch(authorization.uploadUrl, {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body: form,
  });
  if (!response.ok) throw new Error(`The ${variant.purpose} product image upload failed.`);
  return {
    stagingPath: authorization.path,
    purpose: variant.purpose,
    contentType: variant.contentType,
    byteSize: variant.byteSize,
    width: variant.width,
    height: variant.height,
  };
}

export const adminApi = {
  login: async (password: string): Promise<AdminSession> => (await request<{ admin: AdminSession }>("/auth/login", { method: "POST", body: JSON.stringify({ password }) })).admin,
  session: async (): Promise<AdminSession> => (await request<{ admin: AdminSession }>("/auth/session")).admin,
  logout: (): Promise<void> => request<void>("/auth/logout", { method: "POST" }),
  products: async (): Promise<AdminProduct[]> => (await request<{ items: AdminProduct[] }>("/admin/products")).items,
  createProduct: (input: CreateAdminProductInput): Promise<AdminProduct> => request<AdminProduct>("/admin/products", { method: "POST", body: JSON.stringify(input) }),
  createProductWithImage: async (
    input: CreateAdminProductFields,
    file: File,
    directUpload = import.meta.env.PROD,
  ): Promise<AdminProduct> => {
    if (!directUpload) {
      return request<AdminProduct>("/admin/products", {
        method: "POST",
        body: JSON.stringify({ ...input, imageDataUrl: await fileAsDataUrl(file) }),
      });
    }

    const variants = await createProductImageVariants(file);
    const stagedImages: StagedProductImage[] = [];
    for (const variant of variants) stagedImages.push(await uploadVariant(variant));
    return request<AdminProduct>("/admin/products", {
      method: "POST",
      body: JSON.stringify({ ...input, stagedImages }),
    });
  },
  updateProduct: (id: string, patch: { priceQar?: number; stock?: number; nameAr?: string; descriptionAr?: string; categoryAr?: string; lightAr?: string }): Promise<AdminProduct> => request<AdminProduct>(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  orders: async (): Promise<AdminOrder[]> => (await request<{ items: AdminOrder[] }>("/admin/orders")).items,
  updateOrderStatus: (id: string, status: string) => request<AdminOrder>(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  updatePaymentStatus: (id: string, paymentStatus: string) => request<AdminOrder>(`/admin/orders/${id}/payment`, { method: "PATCH", body: JSON.stringify({ paymentStatus }) }),
  deleteOrder: (id: string): Promise<void> => request<void>(`/admin/orders/${id}`, { method: "DELETE" }),
  deleteOrders: (ids: string[]): Promise<void> => request<void>("/admin/orders", { method: "DELETE", body: JSON.stringify({ ids }) }),
  dashboard: (): Promise<AdminDashboard> => request<AdminDashboard>("/admin/dashboard"),
  sales: (from?: string, to?: string): Promise<AdminSalesReport> => request<AdminSalesReport>(`/admin/sales${from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}` : ""}`),
};
