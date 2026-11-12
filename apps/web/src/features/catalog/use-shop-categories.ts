import { useQuery } from "@tanstack/react-query";
import { useSiteLanguage } from "../../app/providers";
import { categoryCounts, useCatalogue } from "./catalogue-client";
import { productApi } from "./product-api";
import { categoryName, orderedCategoryCounts } from "./shop-categories";

export type ShopCategory = { category: string; label: string; count: number; to: string };

/** The categories customers can browse, with real counts: live from the API, or from the saved catalogue. */
export function useShopCategories(): ShopCategory[] {
  const { isArabic } = useSiteLanguage();
  const filters = useQuery({ queryKey: ["catalog-filters"], queryFn: () => productApi.filters(), staleTime: 300_000 });
  const catalogue = useCatalogue();
  const saved = catalogue.data ? categoryCounts(catalogue.data.products) : [];
  const counts: Record<string, number> = filters.data?.categoryCounts
    ?? Object.fromEntries(saved.map((entry) => [entry.category, entry.count]));
  // Nothing to list until real counts arrive; then every category in the shop's order, empty ones included.
  if (!filters.data?.categoryCounts && !catalogue.data) return [];
  return orderedCategoryCounts(counts).map(({ category, count }) => ({
    category,
    count,
    label: categoryName(category, isArabic ? "ar" : "en", filters.data?.categoryLabels?.[category] || saved.find((entry) => entry.category === category)?.categoryAr),
    to: `/shop?category=${encodeURIComponent(category)}`,
  }));
}
