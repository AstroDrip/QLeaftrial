import { useSiteLanguage } from "../../app/providers";

// What delivery costs, stated once and exactly as checkout charges it: nothing. The areas are the ones
// checkout offers. No timing is promised; it is confirmed with each customer.
export function DeliveryNote() {
  const { isArabic } = useSiteLanguage();
  return (
    <p className="delivery-note" data-testid="delivery-note">
      <strong>{isArabic ? "توصيل مجاني" : "Free delivery"}</strong>{" "}
      <span>{isArabic ? "إلى الدوحة والريان والوكرة والخور. نؤكد موعد التوصيل معك بعد الطلب." : "to Doha, Al Rayyan, Al Wakrah and Al Khor. We confirm the delivery time with you after you order."}</span>
    </p>
  );
}
