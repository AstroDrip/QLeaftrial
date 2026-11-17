import { vi } from "vitest";
import { ApiClientError } from "../../lib/api-error";
import type { AdminOrder, AdminProduct, InvoicePageParams, OrderPageParams, ProductPageParams, ProductView } from "./admin-api";
import { filterInvoices, groupByDay, invoiceTotals } from "./invoice-utils";

// Test double for the paged admin endpoints: builds each page from the plain list mocks (adminApi.products and
// adminApi.orders), following the same rules as the API, so page tests keep describing products and orders simply.
type Api = {
  products: () => Promise<AdminProduct[]>; orders: () => Promise<AdminOrder[]>;
  productsPage?: unknown; ordersPage?: unknown; invoicesPage?: unknown; order?: unknown; clearOrderTab?: unknown;
};

const page = <T,>(items: T[], params: { page: number; pageSize: number }) => ({
  items: items.slice((params.page - 1) * params.pageSize, params.page * params.pageSize),
  page: params.page, pageSize: params.pageSize, totalItems: items.length, totalPages: Math.max(1, Math.ceil(items.length / params.pageSize)),
});

const VIEWS: Record<ProductView, (product: AdminProduct) => boolean> = {
  all: () => true, drafts: (p) => p.published === false, review: (p) => Boolean(p.needsReview), featured: (p) => Boolean(p.featured), unpriced: (p) => p.priceQar <= 0,
};
const TABS: Record<OrderPageParams["tab"], string[]> = { PENDING: ["PENDING"], CONFIRMED: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"], CANCELLED: ["CANCELLED"], DELIVERED: ["DELIVERED"] };

export function installPagedFakes(api: Api): void {
  vi.mocked(api.productsPage as (params: ProductPageParams) => Promise<unknown>)?.mockImplementation?.(async (params) => {
    const q = params.q?.toLowerCase();
    const found = (await api.products()).filter((p) => !q || [p.name, p.nameAr, p.scientificName].some((text) => text?.toLowerCase().includes(q)));
    const views = Object.keys(VIEWS) as ProductView[];
    return { ...page(found.filter(VIEWS[params.view ?? "all"]).sort((a, b) => a.name.localeCompare(b.name)), params), counts: Object.fromEntries(views.map((view) => [view, found.filter(VIEWS[view]).length])) };
  });
  vi.mocked(api.ordersPage as (params: OrderPageParams) => Promise<unknown>)?.mockImplementation?.(async (params) => {
    const all = (await api.orders()).filter((o) => !params.q || [o.orderNumber, o.customerName, o.phone].some((text) => text.toLowerCase().includes(params.q!.toLowerCase())));
    const counts = Object.fromEntries((Object.keys(TABS) as Array<OrderPageParams["tab"]>).map((tab) => [tab, all.filter((o) => TABS[tab].includes(o.status)).length]));
    return { ...page(all.filter((o) => TABS[params.tab].includes(o.status)), params), counts };
  });
  vi.mocked(api.invoicesPage as (params: InvoicePageParams) => Promise<unknown>)?.mockImplementation?.(async (params) => {
    const invoices = filterInvoices(await api.orders(), { from: params.from, to: params.to, payment: params.payment ?? "all" });
    return { ...page(invoices, params), totals: invoiceTotals(invoices), dayTotals: Object.fromEntries(groupByDay(invoices).map((day) => [day.day, day.totalQar])) };
  });
  vi.mocked(api.order as (id: string) => Promise<unknown>)?.mockImplementation?.(async (id) => {
    const found = (await api.orders()).find((o) => o.id === id);
    if (!found) throw new ApiClientError("Order not found", "ORDER_NOT_FOUND");
    return found;
  });
  vi.mocked(api.clearOrderTab as (tab: string) => Promise<unknown>)?.mockImplementation?.(async (tab) => ({ deleted: (await api.orders()).filter((o) => o.status === tab).length }));
}
