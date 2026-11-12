import type { ProductDetail, ProductSummary } from "./product-types";
import { categoryName } from "./shop-categories";

// Category names come from the shop's category list (so "Table Top Plants" reads "Tabletop Plants"); unlisted
// categories keep their stored names.
export function localizeProduct<T extends ProductSummary>(product: T, isArabic: boolean): T {
  if (!isArabic) return { ...product, category: categoryName(product.category, "en") };
  return {
    ...product,
    name: product.nameAr?.trim() || product.name,
    category: categoryName(product.category, "ar", product.categoryAr),
    light: product.lightAr?.trim() || product.light,
    ...("description" in product
      ? { description: (product as ProductDetail).descriptionAr?.trim() || (product as ProductDetail).description }
      : {}),
  };
}
