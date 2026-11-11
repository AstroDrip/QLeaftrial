import type {
  ProductDetail,
  ProductListParams,
  ProductListResponse,
  ProductSummary,
} from "./product-types.js";
import { errorFromResponse } from "../../lib/api-error";

const BASE_URL = "/api/v1";
const DEFAULT_TIMEOUT_MS = 15_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  // If the caller provided their own signal, listen to it as well
  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      init.signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        controller.abort();
      }, { once: true });
    }
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });

    if (!response.ok) {
      throw await errorFromResponse(response);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (init?.signal?.aborted) {
        throw error;
      }
      throw new Error("The request timed out. Please check your connection and try again.");
    }
    // Mobile WebKit throws "Load failed" on connection drops/offline; translate to clear message
    if (error instanceof TypeError && error.message === "Load failed") {
      throw new Error("Connection failed. Please check your network and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
    categoryLabels?: Record<string, string>;
    lightLabels?: Record<string, string>;
    categoryCounts?: Record<string, number>;
  }> => request("/products/filters"),
};

export type {
  ProductDetail,
  ProductListParams,
  ProductListResponse,
  ProductSummary,
};
