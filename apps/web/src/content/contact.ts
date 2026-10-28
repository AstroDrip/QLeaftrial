// Single source for public contact details shown across the storefront.
export const WHATSAPP_NUMBER = "97452040988";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;
export const INSTAGRAM_URL = "https://www.instagram.com/qleaves.qa";
export const FALLBACK_PHONE = { href: "tel:+97477551056", label: "+974 7755 1056" };

export function whatsappLink(message?: string): string {
  return message ? `${WHATSAPP_URL}?text=${encodeURIComponent(message)}` : WHATSAPP_URL;
}
