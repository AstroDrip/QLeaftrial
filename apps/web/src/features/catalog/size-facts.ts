import type { ProductDetail } from "./product-types";

// Size and delivery details for the product page facts box. Only what the shop entered; a missing item is left out.
// The notes arrive already in the customer's language (Arabic first, English when there is none).
type SizeFields = Pick<ProductDetail, "heightCm" | "sizeNote" | "potIncluded" | "handlingNote">;

export function sizeFacts(product: SizeFields, isArabic: boolean): Array<{ key: string; label: string; value: string }> {
  const t = isArabic
    ? { height: "الارتفاع", heightValue: (cm: number) => `نحو ${cm} سم مع الأصيص`, size: "الحجم", pot: "الأصيص", included: "مشمول", notIncluded: "غير مشمول", handling: "التوصيل والتعامل" }
    : { height: "Height", heightValue: (cm: number) => `About ${cm} cm with the pot`, size: "Size", pot: "Pot", included: "Included", notIncluded: "Not included", handling: "Delivery and handling" };
  const facts: Array<{ key: string; label: string; value: string }> = [];
  if (product.heightCm) facts.push({ key: "height", label: t.height, value: t.heightValue(product.heightCm) });
  if (product.sizeNote?.trim()) facts.push({ key: "size", label: t.size, value: product.sizeNote.trim() });
  if (product.potIncluded != null) facts.push({ key: "pot", label: t.pot, value: product.potIncluded ? t.included : t.notIncluded });
  if (product.handlingNote?.trim()) facts.push({ key: "handling", label: t.handling, value: product.handlingNote.trim() });
  return facts;
}
