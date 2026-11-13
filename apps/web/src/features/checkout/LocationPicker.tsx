import { Suspense, lazy, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { GeoServiceError, reverseQatarPlace, searchQatarPlaces, type PlaceSuggestion, type Precision } from "../map/geo-api";
import type { LatLon } from "../map/QatarMap";
import { confirmLocation, editDetails, isConfirmed, selectPoint, unconfirm, type DeliveryLocationState, type LocationSource } from "./delivery-location";
import "./location-picker.css";

const QatarMap = lazy(() => import("../map/QatarMap"));

const SEARCH_DELAY_MS = 250;
const LOW_ACCURACY_METRES = 100;

const copy = {
  en: {
    title: "Delivery location",
    intro: "Find your address or use your current location, then check the pin and confirm. We use it only to deliver this order.",
    searchLabel: "Search for your area, street or a nearby landmark",
    searchPlaceholder: "e.g. Lusail, Al Sadd, Villaggio",
    searching: "Searching…",
    noResults: "No places in Qatar match that. Try an area or landmark name.",
    searchFailed: "Search is not available right now. Please try again.",
    useLocation: "Use my current location",
    locating: "Finding you…",
    insecure: "Your browser only shares your location on a secure (https) page. Please search for your address instead.",
    unsupported: "This browser cannot share your location. Please search for your address instead.",
    denied: "Location permission was not given. You can search for your address instead.",
    unavailable: "Your location could not be found. Please search for your address instead.",
    timeout: "Finding your location took too long. Please try again or search for your address.",
    outside: "Your current location is outside Qatar, so it cannot be a delivery address. Please search for your Qatar address.",
    lowAccuracy: (metres: number) => `Your device placed you within about ${metres} m. Drag the pin onto your building if it is not exact.`,
    mapLabel: "Map of Qatar showing the delivery pin",
    selected: "Selected location",
    precision: { gps: "From your device's location", pin: "Placed by you on the map", landmark: "At a named place", street: "On this street. Add your building below", area: "General area only. Please place the pin on your building" } as Record<Precision, string>,
    adjust: "Adjust pin",
    doneAdjusting: "Done adjusting",
    adjustHint: "Drag the pin or tap the map to place it on your door.",
    zone: "Zone",
    street: "Street",
    building: "Building",
    unit: "Floor / flat",
    landmark: "Landmark (optional)",
    confirm: "Confirm delivery location",
    confirmed: "Delivery location confirmed",
    change: "Change location",
    notFinal: "The pin is approximate; the details you add help our driver find the door.",
    lookupFailed: "We could not name this spot, but the pin is still placed. Add your details below.",
    kinds: { area: "Area", landmark: "Place", street: "Street" },
  },
  ar: {
    title: "موقع التوصيل",
    intro: "ابحث عن عنوانك أو استخدم موقعك الحالي، ثم تحقّق من الدبوس وأكّده. نستخدمه فقط لتوصيل هذا الطلب.",
    searchLabel: "ابحث عن منطقتك أو شارعك أو معلم قريب",
    searchPlaceholder: "مثال: لوسيل، السد، فيلاجيو",
    searching: "جارٍ البحث…",
    noResults: "لا توجد أماكن في قطر تطابق ذلك. جرّب اسم منطقة أو معلم.",
    searchFailed: "البحث غير متاح الآن. يرجى المحاولة مرة أخرى.",
    useLocation: "استخدم موقعي الحالي",
    locating: "جارٍ تحديد موقعك…",
    insecure: "لا يشارك متصفحك موقعك إلا على صفحة آمنة (https). يرجى البحث عن عنوانك بدلًا من ذلك.",
    unsupported: "لا يستطيع هذا المتصفح مشاركة موقعك. يرجى البحث عن عنوانك بدلًا من ذلك.",
    denied: "لم يتم منح إذن الموقع. يمكنك البحث عن عنوانك بدلًا من ذلك.",
    unavailable: "تعذر تحديد موقعك. يرجى البحث عن عنوانك بدلًا من ذلك.",
    timeout: "استغرق تحديد موقعك وقتًا طويلًا. حاول مرة أخرى أو ابحث عن عنوانك.",
    outside: "موقعك الحالي خارج قطر، لذا لا يمكن أن يكون عنوان توصيل. يرجى البحث عن عنوانك في قطر.",
    lowAccuracy: (metres: number) => `حدد جهازك موقعك ضمن نحو ${metres} م. اسحب الدبوس إلى مبناك إن لم يكن دقيقًا.`,
    mapLabel: "خريطة قطر تُظهر دبوس التوصيل",
    selected: "الموقع المحدد",
    precision: { gps: "من موقع جهازك", pin: "وضعته بنفسك على الخريطة", landmark: "عند مكان معروف", street: "على هذا الشارع. أضف رقم المبنى أدناه", area: "المنطقة فقط. يرجى وضع الدبوس على مبناك" } as Record<Precision, string>,
    adjust: "ضبط الدبوس",
    doneAdjusting: "تم الضبط",
    adjustHint: "اسحب الدبوس أو انقر على الخريطة لوضعه عند بابك.",
    zone: "المنطقة (رقم)",
    street: "الشارع",
    building: "المبنى",
    unit: "الطابق / الشقة",
    landmark: "معلم قريب (اختياري)",
    confirm: "تأكيد موقع التوصيل",
    confirmed: "تم تأكيد موقع التوصيل",
    change: "تغيير الموقع",
    notFinal: "الدبوس تقريبي؛ التفاصيل التي تضيفها تساعد السائق على الوصول إلى الباب.",
    lookupFailed: "تعذر تسمية هذا المكان، لكن الدبوس ما زال في مكانه. أضف التفاصيل أدناه.",
    kinds: { area: "منطقة", landmark: "مكان", street: "شارع" },
  },
} as const;

type Props = {
  language: "en" | "ar";
  value: DeliveryLocationState;
  onChange: (next: DeliveryLocationState) => void;
  /** Reports whether the map and address search are working, so checkout can offer a written-address fallback. */
  onAvailabilityChange?: (available: boolean) => void;
  error?: string;
};

export function LocationPicker({ language, value, onChange, onAvailabilityChange, error }: Props) {
  const t = copy[language];
  const ids = useId();
  const section = useRef<HTMLElement>(null);
  const [showMap, setShowMap] = useState(typeof IntersectionObserver === "undefined");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [gps, setGps] = useState<{ state: "idle" | "locating" | "error" | "warning"; message?: string }>({ state: "idle" });
  const [adjusting, setAdjusting] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const [lookupFailed, setLookupFailed] = useState(false);
  const latest = useRef(value);
  latest.current = value;
  // Every change goes through here, so several changes in a row each build on the one before (not on the last render).
  const apply = useCallback((next: DeliveryLocationState) => {
    latest.current = next;
    onChange(next);
  }, [onChange]);
  const reverseRequest = useRef<AbortController | null>(null);
  // The street name we filled in ourselves, so a new pin can replace it without touching anything the customer typed.
  const autoStreet = useRef("");
  const confirmed = isConfirmed(value);

  // The map is only loaded when the location step comes near the screen (or is used).
  useEffect(() => {
    const element = section.current;
    if (showMap || !element) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setShowMap(true); observer.disconnect(); } }, { rootMargin: "300px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [showMap]);

  // Search as you type: debounced, cancelled when the text changes, never letting an older answer overwrite a newer one.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearchState("idle"); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState("loading");
      try {
        const near = latest.current.selection ? { latitude: latest.current.selection.latitude, longitude: latest.current.selection.longitude } : null;
        const found = await searchQatarPlaces(q, language, near, controller.signal);
        if (controller.signal.aborted) return;
        setResults(found);
        setActive(found.length ? 0 : -1);
        setSearchState("done");
        onAvailabilityChange?.(true);
      } catch (searchError) {
        if (controller.signal.aborted) return;
        setResults([]);
        setSearchState("error");
        if (searchError instanceof GeoServiceError && searchError.status === 429) return;
        onAvailabilityChange?.(false);
      }
    }, SEARCH_DELAY_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, language, onAvailabilityChange]);

  // Names the point the customer chose (or moved to), keeping the pin even if naming fails.
  const placePoint = useCallback(async (point: LatLon, source: LocationSource, extra: { accuracyMeters?: number; label?: string; precision?: Precision; providerRef?: string } = {}) => {
    reverseRequest.current?.abort();
    const controller = new AbortController();
    reverseRequest.current = controller;
    setLookupFailed(false);
    const provisional = extra.label ?? (language === "ar" ? "موقع على الخريطة" : "Point on the map");
    apply(selectPoint(latest.current, { ...point, source, precision: extra.precision ?? (source === "gps" ? "gps" : "pin"), formattedAddress: provisional, accuracyMeters: extra.accuracyMeters, providerRef: extra.providerRef }));
    try {
      const answer = await reverseQatarPlace(point, language, controller.signal);
      if (controller.signal.aborted) return false;
      if (!answer.inQatar) return false;
      // A search result keeps its own name; GPS and hand-placed points take the nearest named place.
      const formattedAddress = extra.label ? [extra.label, answer.area, language === "ar" ? "قطر" : "Qatar"].filter((part, index, all) => part && all.indexOf(part) === index).join(language === "ar" ? "، " : ", ") : answer.formattedAddress;
      apply(selectPoint(latest.current, { ...point, source, precision: extra.precision ?? (source === "gps" ? "gps" : "pin"), formattedAddress, accuracyMeters: extra.accuracyMeters, providerRef: extra.providerRef }));
      const typed = latest.current.details.street;
      if (!typed || typed === autoStreet.current) {
        autoStreet.current = answer.street ?? "";
        apply(editDetails(latest.current, { street: answer.street ?? "" }));
      }
      return true;
    } catch (lookupError) {
      if (!controller.signal.aborted) setLookupFailed(true);
      return !(lookupError instanceof Error && lookupError.name === "AbortError");
    }
  }, [language, apply]);

  function choose(result: PlaceSuggestion) {
    setOpen(false);
    setQuery(result.label);
    setAdjusting(false);
    setGps({ state: "idle" });
    setFocusKey((key) => key + 1);
    void placePoint({ latitude: result.latitude, longitude: result.longitude }, "search", { label: result.label, precision: result.precision, providerRef: result.id });
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setOpen(true); setActive((current) => (current + 1) % results.length); }
    else if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setOpen(true); setActive((current) => (current <= 0 ? results.length - 1 : current - 1)); }
    else if (event.key === "Enter" && open && results[active]) { event.preventDefault(); choose(results[active]); }
    else if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
  }

  // One location request, only when asked; never watched or repeated.
  function useCurrentLocation() {
    if (typeof window !== "undefined" && window.isSecureContext === false) { setGps({ state: "error", message: t.insecure }); return; }
    if (!("geolocation" in navigator)) { setGps({ state: "error", message: t.unsupported }); return; }
    setGps({ state: "locating" });
    navigator.geolocation.getCurrentPosition(async (position) => {
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const accuracy = Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : undefined;
      try {
        const answer = await reverseQatarPlace(point, language);
        if (!answer.inQatar) { setGps({ state: "error", message: t.outside }); return; }
      } catch {
        // Naming failed; the point itself is still checked on the server when the order is placed.
      }
      setFocusKey((key) => key + 1);
      setAdjusting(false);
      await placePoint(point, "gps", { accuracyMeters: accuracy });
      setGps(accuracy !== undefined && accuracy > LOW_ACCURACY_METRES ? { state: "warning", message: t.lowAccuracy(accuracy) } : { state: "idle" });
    }, (failure) => {
      const message = failure.code === failure.PERMISSION_DENIED ? t.denied : failure.code === failure.TIMEOUT ? t.timeout : t.unavailable;
      setGps({ state: "error", message });
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 });
  }

  const selection = value.selection;
  const pin = selection ? { latitude: selection.latitude, longitude: selection.longitude } : null;
  const listId = `${ids}-results`;
  const detail = (name: keyof DeliveryLocationState["details"], label: string, inputMode?: "numeric") => (
    <label className="location-picker__field">
      <span>{label}</span>
      <input
        value={value.details[name]}
        inputMode={inputMode}
        maxLength={name === "landmark" ? 160 : 80}
        dir="auto"
        onChange={(event) => apply(editDetails(latest.current, { [name]: event.target.value }))}
      />
    </label>
  );

  return (
    <section ref={section} className={`location-picker${confirmed ? " is-confirmed" : ""}`} aria-labelledby={`${ids}-title`} data-testid="location-picker">
      <div className="location-picker__head">
        <h2 id={`${ids}-title`}>{t.title}</h2>
        <p>{t.intro}</p>
      </div>

      <div className="location-picker__finders">
        <div className="location-picker__search">
          <label htmlFor={`${ids}-search`} className="location-picker__search-label">{t.searchLabel}</label>
          <input
            id={`${ids}-search`}
            type="search"
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            dir="auto"
            value={query}
            placeholder={t.searchPlaceholder}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={onSearchKey}
          />
          {open && query.trim().length >= 2 ? (
            <div className="location-picker__results">
              {searchState === "loading" && results.length === 0 ? <p className="location-picker__note" role="status">{t.searching}</p> : null}
              {searchState === "done" && results.length === 0 ? <p className="location-picker__note" role="status">{t.noResults}</p> : null}
              {searchState === "error" ? <p className="location-picker__note location-picker__note--error" role="alert">{t.searchFailed}</p> : null}
              {results.length ? (
                <ul id={listId} role="listbox" aria-label={t.searchLabel}>
                  {results.map((result, index) => (
                    <li
                      key={`${result.id}-${index}`}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === active}
                      className={index === active ? "is-active" : undefined}
                      onMouseDown={(event) => { event.preventDefault(); choose(result); }}
                      onMouseEnter={() => setActive(index)}
                    >
                      <span className="location-picker__result-name" dir="auto">{result.label}</span>
                      <span className="location-picker__result-meta" dir="auto">{t.kinds[result.kind]} · {result.context}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <button type="button" className="location-picker__gps" onClick={useCurrentLocation} disabled={gps.state === "locating"} aria-busy={gps.state === "locating" || undefined}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7.5" /></svg>
          <span>{gps.state === "locating" ? t.locating : t.useLocation}</span>
        </button>
      </div>
      {gps.message ? <p className={`location-picker__note${gps.state === "error" ? " location-picker__note--error" : ""}`} role={gps.state === "error" ? "alert" : "status"}>{gps.message}</p> : null}

      <div className="location-picker__map">
        {showMap ? (
          <Suspense fallback={<div className="location-picker__map-placeholder" />}>
            <QatarMap
              language={language}
              pin={pin}
              focusKey={focusKey}
              editable={adjusting}
              label={t.mapLabel}
              onPinMove={(point) => { setOpen(false); void placePoint(point, "pin"); }}
              onReady={() => onAvailabilityChange?.(true)}
              onError={() => onAvailabilityChange?.(false)}
            />
          </Suspense>
        ) : <div className="location-picker__map-placeholder" />}
      </div>
      {adjusting ? <p className="location-picker__note" role="note">{t.adjustHint}</p> : null}

      {selection ? (
        <div className="location-picker__selected">
          <div className="location-picker__address">
            <span className="location-picker__eyebrow">{t.selected}</span>
            <strong dir="auto">{selection.formattedAddress}</strong>
            <span className="location-picker__precision">{t.precision[selection.precision]}{selection.accuracyMeters !== undefined ? ` (±${Math.round(selection.accuracyMeters)} ${language === "ar" ? "م" : "m"})` : ""}</span>
            {lookupFailed ? <span className="location-picker__note location-picker__note--error" role="status">{t.lookupFailed}</span> : null}
          </div>
          <button type="button" className="location-picker__adjust" aria-pressed={adjusting} onClick={() => { setAdjusting((current) => !current); if (confirmed) apply(unconfirm(latest.current)); }}>
            {adjusting ? t.doneAdjusting : t.adjust}
          </button>
        </div>
      ) : null}

      {selection ? (
        <div className="location-picker__details">
          {detail("zone", t.zone, "numeric")}
          {detail("street", t.street)}
          {detail("building", t.building)}
          {detail("unit", t.unit)}
          <div className="location-picker__wide">{detail("landmark", t.landmark)}</div>
        </div>
      ) : null}

      {selection ? (
        <div className="location-picker__confirm">
          {confirmed ? (
            <>
              <p className="location-picker__confirmed" role="status">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                {t.confirmed}
              </p>
              <button type="button" className="location-picker__change" onClick={() => { apply(unconfirm(latest.current)); setAdjusting(true); }}>{t.change}</button>
            </>
          ) : (
            <>
              <p className="location-picker__fine-print">{t.notFinal}</p>
              <button type="button" className="primary-button location-picker__confirm-button" onClick={() => { setAdjusting(false); apply(confirmLocation(latest.current)); }}>{t.confirm}</button>
            </>
          )}
        </div>
      ) : null}
      {error ? <p className="location-picker__note location-picker__note--error" role="alert">{error}</p> : null}
    </section>
  );
}
