import type {
  ProductDetail,
  ProductListParams,
  ProductListResponse,
  ProductSummary,
} from "./product-types.js";
import { errorFromResponse } from "../../lib/api-error";

const BASE_URL = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    throw await errorFromResponse(response);
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
  detail: (slug: string): Promise<ProductDetail> =>
    request<ProductDetail>(`/products/${slug}`),
  filters: (): Promise<{
    categories: string[];
    lights: string[];
  }> => request("/products/filters"),
};

export type {
  ProductDetail,
  ProductListParams,
  ProductListResponse,
  ProductSummary,
};
