export interface AdminSession { name: string }
export interface AdminProduct { id: string; slug: string; name: string; priceQar: number; stock: number }

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
  updateProduct: (id: string, patch: { priceQar?: number; stock?: number }): Promise<AdminProduct> => request<AdminProduct>(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
};
