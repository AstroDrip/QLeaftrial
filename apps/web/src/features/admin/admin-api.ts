import { errorFromResponse } from "../../lib/api-error";
import { createProductImageVariants, type ProductImageVariant } from "./product-image-variants";

export interface AdminSession { name: string }
export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  nameAr?: string | null;
  description: string;
  descriptionAr?: string | null;
  category: string;
  categoryAr?: string | null;
  light: string | null;
  lightAr?: string | null;
  priceQar: number;
  costPrice?: number;
  stock: number;
  image?: { url: string; altText: string } | null;
  published?: boolean;
  compareAtPriceQar?: number | null;
  featured?: boolean;
  scientificName?: string | null;
  watering?: string | null;
  wateringAr?: string | null;
  humidity?: string | null;
  humidityAr?: string | null;
  soil?: string | null;
  soilAr?: string | null;
  temperature?: string | null;
  temperatureAr?: string | null;
  careLevel?: "easy" | "moderate" | "demanding" | null;
  heightCm?: number | null;
  sizeNote?: string | null;
  sizeNoteAr?: string | null;
  potIncluded?: boolean | null;
  handlingNote?: string | null;
  handlingNoteAr?: string | null;
  placement?: "indoor" | "outdoor" | "indoor-outdoor" | null;
  needsReview?: boolean;
  reviewNote?: string | null;
  searchAliases?: string | null;
  /** The product's photographs, main one first (at most three). */
  photos?: AdminPhoto[];
  /** How many more photographs the product can take before it has the full three. */
  photosMissing?: number;
}

export interface AdminPhoto {
  key: string;
  url: string;
  detailUrl: string | null;
  altText: string;
  width: number | null;
  height: number | null;
  contentHash: string | null;
}

/** Where an upload is: making the two sizes, sending them, saving. */
export type PhotoProgress = { step: "preparing" } | { step: "uploading"; done: number; total: number } | { step: "saving" };
export const MAX_PRODUCT_PHOTOS = 3;

export interface CreateAdminProductFields {
  name: string;
  nameAr: string;
  slug: string;
  sku: string;
  description: string;
  descriptionAr: string;
  category: string;
  categoryAr: string;
  light?: string;
  lightAr?: string;
  priceQar: number;
  costPrice: number;
  stock: number;
  imageAltText: string;
}

export type AdminProductPatch = Partial<{
  priceQar: number;
  costPrice: number;
  stock: number;
  published: boolean;
  name: string;
  description: string;
  category: string;
  light: string | null;
  nameAr: string;
  descriptionAr: string;
  categoryAr: string;
  lightAr: string;
  compareAtPriceQar: number | null;
  featured: boolean;
  scientificName: string | null;
  watering: string | null;
  wateringAr: string;
  humidity: string | null;
  humidityAr: string;
  soil: string | null;
  soilAr: string;
  temperature: string | null;
  temperatureAr: string;
  careLevel: "easy" | "moderate" | "demanding" | null;
  heightCm: number | null;
  sizeNote: string | null;
  sizeNoteAr: string | null;
  potIncluded: boolean | null;
  handlingNote: string | null;
  handlingNoteAr: string | null;
  placement: "indoor" | "outdoor" | "indoor-outdoor" | null;
  needsReview: boolean;
  reviewNote: string | null;
  searchAliases?: string | null;
}>;

export interface StagedProductImage {
  stagingPath: string;
  purpose: "catalog" | "detail";
  contentType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
}

export type CreateAdminProductInput = CreateAdminProductFields & {
  imageDataUrl?: string;
  stagedImages?: StagedProductImage[];
};

export interface AdminOrderItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPriceQar: number;
}

// What the shop changed when it accepted an edited pending order.
export type OrderChange =
  | { type: "removed"; name: string; quantity: number }
  | { type: "quantity"; name: string; from: number; to: number }
  | { type: "replaced"; from: string; to: string; quantity: number };

export interface AdminDeliveryLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  source: string;
  precision: string;
  accuracyMeters?: number | null;
  area?: string | null;
  zone?: string | null;
  street?: string | null;
  building?: string | null;
  unit?: string | null;
  landmark?: string | null;
  confirmedAt: string;
}

export interface OrderNotification {
  id: string;
  eventType: "ORDER_CREATED" | "PAYMENT_VERIFIED" | "PAYMENT_FAILED" | "ORDER_CANCELLED";
  /** DISABLED: order emails were not set up when the order was placed. */
  status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "DISABLED";
  attempts: number;
  lastErrorCode?: string | null;
  sentAt?: string | null;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  email: string;
  addressLine1: string;
  area: string;
  deliveryNotes?: string | null;
  paymentMethod: "COD" | "PAYMENT_LINK";
  subtotalQar: number;
  deliveryFeeQar: number;
  /** Below the free-delivery threshold: the charge is still to be agreed with the customer. */
  deliveryChargePending?: boolean;
  deliveryFeeConfirmedAt?: string | null;
  sheetSyncedAt?: string | null;
  sheetSyncError?: string | null;
  /** Emails to the shop about this order, oldest first. */
  notifications?: OrderNotification[];
  deliveryLocation?: AdminDeliveryLocation | null;
  deliveryLocationManual?: boolean;
  /** The municipality the pin is in (worked out on the server from the coordinates). */
  deliveryMunicipality?: { key: string; en: string; ar: string; label: string; labelAr: string } | null;
  /** For each address part: "map" when it matches what the map knows for the pin, "customer" when typed by the customer. */
  deliveryFieldSources?: { area: "map" | "customer" | null; street: "map" | "customer" | null; landmark: "map" | "customer" | null };
  status: string;
  paymentStatus: string;
  createdAt: string;
  items: AdminOrderItem[];
  editChanges: OrderChange[];
  invoiceToken: string;
}

export interface EditedOrderLine {
  orderItemId: string;
  included: boolean;
  productId: string;
  quantity: number;
}

export interface AdminDashboard {
  ordersToday: number;
  liveInventory: number;
  lowStock: number;
  // Goods plus confirmed delivery charges still to be collected; the two parts are also given separately.
  pendingPayoutsQar: number;
  pendingMerchandiseQar?: number;
  pendingDeliveryQar?: number;
}

export interface StoreSettings {
  orderingEnabled: boolean;
  commercialRegistration: string | null;
  ecommerceLicense: string | null;
  businessAddress: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
}

export interface AdminSalesReport {
  orders: number;
  revenueQar: number;
  paidRevenueQar: number;
  unpaidRevenueQar: number;
  // "Revenue" figures are merchandise only. Delivery charges and totals are reported beside them.
  merchandiseQar?: number;
  deliveryQar?: number;
  totalQar?: number;
  paidTotalQar?: number;
  unpaidTotalQar?: number;
  topItems: Array<{ name: string; quantity: number }>;
  byDay: Array<{ date: string; orders: number; revenueQar: number; deliveryQar?: number; totalQar?: number }>;
}

export interface AdminReview {
  id: string;
  customerName: string;
  body: string;
  rating: number;
  imageUrl: string | null;
  productId: string | null;
  productName: string | null;
  reviewedAt: string | null;
  location: string | null;
  label: string | null;
  sortOrder: number;
  published: boolean;
  createdAt: string;
}

export interface ReviewInput {
  customerName: string;
  body: string;
  rating: number;
  productId: string | null;
  reviewedAt: string | null;
  location: string | null;
  label: string | null;
  published: boolean;
  imageDataUrl?: string;
  removeImage?: boolean;
}

const BASE_URL = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && typeof window !== "undefined") {
      window.dispatchEvent(new Event("qleaves:admin-unauthorized"));
    }
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

async function uploadImageVariants(file: File, onProgress?: (progress: PhotoProgress) => void): Promise<StagedProductImage[]> {
  onProgress?.({ step: "preparing" });
  const variants = await createProductImageVariants(file);
  const stagedImages: StagedProductImage[] = [];
  for (const variant of variants) {
    onProgress?.({ step: "uploading", done: stagedImages.length, total: variants.length });
    stagedImages.push(await uploadVariant(variant));
  }
  onProgress?.({ step: "saving" });
  return stagedImages;
}

/** SHA-256 (hex) of the photograph as chosen, so the same picture can be recognised before anything is uploaded. */
export async function photoFingerprint(file: Blob): Promise<string | undefined> {
  try {
    const bytes = typeof file.arrayBuffer === "function"
      ? await file.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined; // no Web Crypto here: the server still accepts the photo, only without the duplicate check
  }
}

/** One photograph ready to send: both sizes uploaded straight to storage (production) or inline (development). */
async function photoPayload(file: File, imageAltText: string, directUpload: boolean, onProgress?: (progress: PhotoProgress) => void) {
  const contentHash = await photoFingerprint(file);
  const images = directUpload
    ? { stagedImages: await uploadImageVariants(file, onProgress) }
    : { imageDataUrl: await fileAsDataUrl(file) };
  if (!directUpload) onProgress?.({ step: "saving" });
  return { imageAltText, ...(contentHash ? { contentHash } : {}), ...images };
}

export const adminApi = {
  login: async (password: string): Promise<AdminSession> =>
    (await request<{ admin: AdminSession }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    })).admin,
  session: async (): Promise<AdminSession> =>
    (await request<{ admin: AdminSession }>("/auth/session")).admin,
  logout: (): Promise<void> => request<void>("/auth/logout", { method: "POST" }),
  products: async (): Promise<AdminProduct[]> =>
    (await request<{ items: AdminProduct[] }>("/admin/products")).items,
  createProduct: (input: CreateAdminProductInput): Promise<AdminProduct> =>
    request<AdminProduct>("/admin/products", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProduct: (id: string, patch: AdminProductPatch): Promise<AdminProduct> =>
    request<AdminProduct>(`/admin/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  replaceProductImage: async (
    id: string,
    file: File,
    imageAltText: string,
    directUpload = import.meta.env.PROD,
  ): Promise<AdminProduct> =>
    request<AdminProduct>(`/admin/products/${id}/images`, {
      method: "PUT",
      body: JSON.stringify(directUpload
        ? { imageAltText, stagedImages: await uploadImageVariants(file) }
        : { imageAltText, imageDataUrl: await fileAsDataUrl(file) }),
    }),
  addPhoto: async (id: string, file: File, imageAltText: string, onProgress?: (progress: PhotoProgress) => void, directUpload = import.meta.env.PROD): Promise<AdminProduct> =>
    request<AdminProduct>(`/admin/products/${id}/photos`, { method: "POST", body: JSON.stringify(await photoPayload(file, imageAltText, directUpload, onProgress)) }),
  replacePhoto: async (id: string, key: string, file: File, imageAltText: string, onProgress?: (progress: PhotoProgress) => void, directUpload = import.meta.env.PROD): Promise<AdminProduct> =>
    request<AdminProduct>(`/admin/products/${id}/photos/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify(await photoPayload(file, imageAltText, directUpload, onProgress)) }),
  removePhoto: (id: string, key: string): Promise<AdminProduct> =>
    request<AdminProduct>(`/admin/products/${id}/photos/${encodeURIComponent(key)}`, { method: "DELETE" }),
  reorderPhotos: (id: string, keys: string[]): Promise<AdminProduct> =>
    request<AdminProduct>(`/admin/products/${id}/photos/order`, { method: "PUT", body: JSON.stringify({ keys }) }),
  describePhoto: (id: string, key: string, altText: string): Promise<AdminProduct> =>
    request<AdminProduct>(`/admin/products/${id}/photos/${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify({ altText }) }),
  deleteProduct: (id: string): Promise<void> =>
    request<void>(`/admin/products/${id}`, { method: "DELETE" }),
  orders: async (): Promise<AdminOrder[]> =>
    (await request<{ items: AdminOrder[] }>("/admin/orders")).items,
  updateOrderStatus: (id: string, status: string) =>
    request<AdminOrder>(`/admin/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  acceptEditedOrder: (id: string, items: EditedOrderLine[]) =>
    request<AdminOrder>(`/admin/orders/${id}/accept-edited`, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  confirmDeliveryFee: (id: string, deliveryFeeQar: number) =>
    request<AdminOrder>(`/admin/orders/${id}/delivery-fee`, {
      method: "PATCH",
      body: JSON.stringify({ deliveryFeeQar }),
    }),
  retryNotification: (id: string): Promise<OrderNotification> =>
    request(`/admin/notifications/${id}/retry`, { method: "POST" }),
  syncOrderToSheet: (id: string): Promise<{ written: boolean; qualifies: boolean }> =>
    request(`/admin/sheets/sync/${id}`, { method: "POST" }),
  updatePaymentStatus: (id: string, paymentStatus: string) =>
    request<AdminOrder>(`/admin/orders/${id}/payment`, {
      method: "PATCH",
      body: JSON.stringify({ paymentStatus }),
    }),
  deleteOrder: (id: string): Promise<void> =>
    request<void>(`/admin/orders/${id}`, { method: "DELETE" }),
  deleteOrders: (ids: string[]): Promise<void> =>
    request<void>("/admin/orders", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    }),
  reviews: async (): Promise<AdminReview[]> =>
    (await request<{ items: AdminReview[] }>("/admin/reviews")).items,
  createReview: (input: ReviewInput): Promise<AdminReview> =>
    request<AdminReview>("/admin/reviews", { method: "POST", body: JSON.stringify(input) }),
  updateReview: (id: string, input: Partial<ReviewInput>): Promise<AdminReview> =>
    request<AdminReview>(`/admin/reviews/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteReview: (id: string): Promise<void> =>
    request<void>(`/admin/reviews/${id}`, { method: "DELETE" }),
  moveReview: async (id: string, direction: "up" | "down"): Promise<AdminReview[]> =>
    (await request<{ items: AdminReview[] }>(`/admin/reviews/${id}/move`, { method: "POST", body: JSON.stringify({ direction }) })).items,
  dashboard: (): Promise<AdminDashboard> =>
    request<AdminDashboard>("/admin/dashboard"),
  sheetsStatus: (): Promise<{ configured: boolean; tab?: string; sheetUrl?: string }> =>
    request("/admin/sheets/status"),
  syncSheets: (): Promise<{ synced: number }> =>
    request("/admin/sheets/sync", { method: "POST" }),
  updateOrderingEnabled: (orderingEnabled: boolean): Promise<StoreSettings> =>
    request<StoreSettings>("/admin/storefront-settings", {
      method: "PUT",
      body: JSON.stringify({ orderingEnabled }),
    }),
  updateBusinessSettings: (settings: Omit<StoreSettings, "orderingEnabled">): Promise<StoreSettings> =>
    request<StoreSettings>("/admin/storefront-settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  sales: (from?: string, to?: string): Promise<AdminSalesReport> =>
    request<AdminSalesReport>(
      `/admin/sales${from || to
        ? `?${new URLSearchParams({
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          })}`
          : ""}`,
    ),
  createProductWithImage: async (
    input: CreateAdminProductFields,
    file: File,
    directUpload = import.meta.env.PROD,
    onProgress?: (progress: PhotoProgress) => void,
  ): Promise<AdminProduct> => {
    const { imageAltText: _alt, ...photo } = await photoPayload(file, input.imageAltText, directUpload, onProgress);
    return request<AdminProduct>("/admin/products", {
      method: "POST",
      body: JSON.stringify({ ...input, ...photo }),
    });
  },
};
