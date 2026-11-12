import { useQuery } from "@tanstack/react-query";
import { useSiteLanguage } from "../../app/providers";
import { categoryCounts, useCatalogue } from "./catalogue-client";
import { productApi } from "./product-api";

export type ShopCategory = { category: string; label: string; count: number; to: string };

/** The categories customers can browse, with real counts: live from the API, or from the saved catalogue. */
export function useShopCategories(): ShopCategory[] {
  const { isArabic } = useSiteLanguage();
  const filters = useQuery({ queryKey: ["catalog-filters"], queryFn: () => productApi.filters(), staleTime: 300_000 });
  const catalogue = useCatalogue();
  const saved = catalogue.data ? categoryCounts(catalogue.data.products) : [];
  const entries: Array<[string, number]> = filters.data?.categoryCounts
    ? Object.entries(filters.data.categoryCounts)
    : saved.map((entry) => [entry.category, entry.count]);
  return entries
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => ({
      category,
      count,
      label: isArabic ? filters.data?.categoryLabels?.[category] || saved.find((entry) => entry.category === category)?.categoryAr || category : category,
      to: `/shop?category=${encodeURIComponent(category)}`,
    }));
}
