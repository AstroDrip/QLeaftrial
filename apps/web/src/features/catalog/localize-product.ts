import type { ProductDetail, ProductSummary } from "./product-types";

export function localizeProduct<T extends ProductSummary>(product: T, isArabic: boolean): T {
  if (!isArabic) return product;
  return {
    ...product,
    name: product.nameAr?.trim() || product.name,
    category: product.categoryAr?.trim() || product.category,
    light: product.lightAr?.trim() || product.light,
    ...("description" in product
      ? { description: (product as ProductDetail).descriptionAr?.trim() || (product as ProductDetail).description }
      : {}),
  };
}
