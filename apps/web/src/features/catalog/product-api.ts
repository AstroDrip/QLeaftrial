import type {
  ProductDetail,
  ProductListParams,
  ProductListResponse,
  ProductSummary,
} from "./product-types.js";

const BASE_URL = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error?.error?.message ||
        `Request to ${path} failed with ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export const productApi = {
  list: (params: ProductListParams): Promise<ProductListResponse> => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<ProductListResponse>(`/products?${search}`);
  },
  detail: (slug: string, lang: "en" | "ar" = "en"): Promise<ProductDetail> =>
    request<ProductDetail>(`/products/${slug}?lang=${lang}`),
  filters: (lang: "en" | "ar" = "en"): Promise<{
    categories: string[];
    lights: string[];
  }> => request(`/products/filters?lang=${lang}`),
};

export type {
  ProductDetail,
  ProductListParams,
  ProductListResponse,
  ProductSummary,
};
