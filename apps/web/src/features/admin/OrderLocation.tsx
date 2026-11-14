import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { AdminOrder, AdminDeliveryLocation } from "./admin-api";

const QatarMap = lazy(() => import("../map/QatarMap"));

export type LocationStatus = "confirmed" | "manual" | "missing";
export function locationStatus(order: Pick<AdminOrder, "deliveryLocation" | "deliveryLocationManual">): LocationStatus {
  if (order.deliveryLocation) return "confirmed";
  return order.deliveryLocationManual ? "manual" : "missing";
}

const copyText = {
  en: {
    title: "Delivery location",
    status: { confirmed: "Location confirmed", manual: "Written address only", missing: "Location not recorded" } as Record<LocationStatus, string>,
    manualNote: "The map was unavailable when this order was placed. The customer gave a written address only; confirm the location with them.",
    missingNote: "Delivery location was not recorded for this order.",
    municipality: "Municipality", outside: "Outside delivery areas", outsideNote: "This pin is outside Doha, Al Rayyan, Al Wakrah and Al Khor. Confirm delivery with the customer.",
    area: "Area", zone: "Zone", street: "Street", building: "Building", unit: "Floor / flat", landmark: "Landmark",
    coordinates: "Coordinates", source: "Found by", accuracy: "Device accuracy", confirmedAt: "Confirmed",
    sources: { gps: "Customer's device location", search: "Address search", pin: "Pin placed by the customer" } as Record<string, string>,
    precision: { gps: "device location", landmark: "named place", street: "street level", area: "area only", pin: "placed by hand" } as Record<string, string>,
    copyCoords: "Copy coordinates", copyAddress: "Copy address", copied: "Copied", copyFailed: "Could not copy; select the text instead", openMaps: "Open in Google Maps",
    showMap: "Show on map", hideMap: "Hide map", larger: "Larger map", close: "Close", mapLabel: "Map of the delivery location",
  },
  ar: {
    title: "موقع التوصيل",
    status: { confirmed: "تم تأكيد الموقع", manual: "عنوان مكتوب فقط", missing: "لم يُسجّل الموقع" } as Record<LocationStatus, string>,
    manualNote: "كانت الخريطة غير متاحة عند تقديم هذا الطلب. قدّم العميل عنوانًا مكتوبًا فقط؛ أكّد الموقع معه.",
    missingNote: "لم يُسجّل موقع التوصيل لهذا الطلب.",
    municipality: "البلدية", outside: "خارج مناطق التوصيل", outsideNote: "هذا الدبوس خارج الدوحة والريان والوكرة والخور. أكّد التوصيل مع العميل.",
    area: "المنطقة", zone: "المنطقة (رقم)", street: "الشارع", building: "المبنى", unit: "الطابق / الشقة", landmark: "معلم قريب",
    coordinates: "الإحداثيات", source: "طريقة التحديد", accuracy: "دقة الجهاز", confirmedAt: "وقت التأكيد",
    sources: { gps: "موقع جهاز العميل", search: "البحث عن العنوان", pin: "دبوس وضعه العميل" } as Record<string, string>,
    precision: { gps: "موقع الجهاز", landmark: "مكان معروف", street: "مستوى الشارع", area: "المنطقة فقط", pin: "وُضع يدويًا" } as Record<string, string>,
    copyCoords: "نسخ الإحداثيات", copyAddress: "نسخ العنوان", copied: "تم النسخ", copyFailed: "تعذر النسخ؛ حدّد النص بدلًا من ذلك", openMaps: "فتح في خرائط Google",
    showMap: "عرض على الخريطة", hideMap: "إخفاء الخريطة", larger: "خريطة أكبر", close: "إغلاق", mapLabel: "خريطة موقع التوصيل",
  },
} as const;

function fullAddress(location: AdminDeliveryLocation): string {
  const parts = [
    location.unit,
    location.building && `Building ${location.building}`,
    location.street,
    location.zone && `Zone ${location.zone}`,
    location.formattedAddress,
    location.landmark && `(${location.landmark})`,
  ].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

// Coordinates are validated numbers from our own database; they are formatted, never concatenated from text.
function googleMapsUrl(latitude: number, longitude: number): string {
  const lat = Number(latitude).toFixed(6);
  const lon = Number(longitude).toFixed(6);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`;
}

export function LocationStatusChip({ order, isArabic }: { order: AdminOrder; isArabic: boolean }) {
  const status = locationStatus(order);
  const t = copyText[isArabic ? "ar" : "en"];
  const outside = status === "confirmed" && order.deliveryMunicipality && !order.deliveryMunicipality.deliveryArea;
  return (
    <>
      <span className={`admin-location-chip admin-location-chip--${status}`} data-testid="location-status">{t.status[status]}</span>
      {outside ? <span className="admin-location-chip admin-location-chip--manual" data-testid="location-outside">{t.outside}</span> : null}
    </>
  );
}

export function OrderLocation({ order, isArabic }: { order: AdminOrder; isArabic: boolean }) {
  const t = copyText[isArabic ? "ar" : "en"];
  const location = order.deliveryLocation;
  const [copied, setCopied] = useState<"coords" | "address" | "failed" | null>(null);
  const [showMap, setShowMap] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [large, setLarge] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!location) {
    const status = locationStatus(order);
    return (
      <div className={`admin-location admin-location--${status}`} data-testid="order-location">
        <p className="admin-location__note">{status === "manual" ? t.manualNote : t.missingNote}</p>
      </div>
    );
  }

  const coords = `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
  // The Clipboard API needs a secure page and permission; the older copy command is the fallback, and if both are
  // unavailable the admin is told rather than left guessing.
  async function copy(kind: "coords" | "address") {
    const text = kind === "coords" ? coords : fullAddress(location!);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      return;
    } catch {
      // fall through
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let done = false;
    try { done = document.execCommand("copy"); } catch { done = false; }
    area.remove();
    setCopied(done ? kind : "failed");
  }
  const municipality = order.deliveryMunicipality;
  const rows: Array<[string, string | null | undefined]> = [
    [t.municipality, municipality ? (isArabic ? municipality.ar : municipality.en) : null],
    [t.area, location.area], [t.zone, location.zone], [t.street, location.street], [t.building, location.building], [t.unit, location.unit], [t.landmark, location.landmark],
  ];
  const confirmed = new Intl.DateTimeFormat(isArabic ? "ar-QA" : "en-GB", { timeZone: "Asia/Qatar", dateStyle: "medium", timeStyle: "short" }).format(new Date(location.confirmedAt));
  const pin = { latitude: location.latitude, longitude: location.longitude };

  return (
    <div className="admin-location" data-testid="order-location">
      <h3 className="admin-location__title">{t.title}</h3>
      <p className="admin-location__address" dir="auto">{location.formattedAddress}</p>
      {municipality && !municipality.deliveryArea ? <p className="admin-location__note admin-location__note--warn">{t.outsideNote}</p> : null}
      <dl className="admin-location__details">
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>
        ))}
        <div><dt>{t.coordinates}</dt><dd dir="ltr" className="admin-location__coords">{coords}</dd></div>
        <div><dt>{t.source}</dt><dd>{t.sources[location.source] ?? location.source} · {t.precision[location.precision] ?? location.precision}</dd></div>
        {location.accuracyMeters !== null && location.accuracyMeters !== undefined ? <div><dt>{t.accuracy}</dt><dd dir="ltr">±{Math.round(location.accuracyMeters)} m</dd></div> : null}
        <div><dt>{t.confirmedAt}</dt><dd>{confirmed}</dd></div>
      </dl>
      <div className="admin-location__actions">
        <button type="button" className="admin-order-extras__button" onClick={() => copy("coords")}>{copied === "coords" ? t.copied : t.copyCoords}</button>
        <button type="button" className="admin-order-extras__button" onClick={() => copy("address")}>{copied === "address" ? t.copied : t.copyAddress}</button>
        <a className="admin-order-extras__button" href={googleMapsUrl(location.latitude, location.longitude)} target="_blank" rel="noreferrer noopener">{t.openMaps}</a>
        <button type="button" className="admin-order-extras__button" aria-expanded={showMap} onClick={() => setShowMap((current) => !current)}>{showMap ? t.hideMap : t.showMap}</button>
        {showMap ? <button type="button" className="admin-order-extras__button" onClick={() => { setLarge(true); dialog.current?.showModal(); }}>{t.larger}</button> : null}
      </div>
      {copied === "failed" ? <p className="admin-location__note admin-location__note--warn" role="status">{t.copyFailed}</p> : null}
      {showMap ? (
        <div className="admin-location__map">
          <Suspense fallback={<div className="admin-location__map-placeholder" />}>
            <QatarMap language={isArabic ? "ar" : "en"} pin={pin} label={t.mapLabel} />
          </Suspense>
        </div>
      ) : null}
      <dialog ref={dialog} className="admin-location__dialog" onClose={() => setLarge(false)} aria-label={t.mapLabel}>
        <div className="admin-location__dialog-head">
          <p dir="auto">{location.formattedAddress}</p>
          <button type="button" className="admin-order-extras__button" onClick={() => dialog.current?.close()}>{t.close}</button>
        </div>
        {large ? (
          <div className="admin-location__dialog-map">
            <Suspense fallback={<div className="admin-location__map-placeholder" />}>
              <QatarMap language={isArabic ? "ar" : "en"} pin={pin} label={t.mapLabel} />
            </Suspense>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
