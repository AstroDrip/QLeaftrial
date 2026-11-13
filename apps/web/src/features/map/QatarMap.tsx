import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { loadMap } from "./load-map";
import { QATAR_MAX_BOUNDS, QATAR_VIEW, qatarStyle } from "./map-style";
import "./qatar-map.css";

export type LatLon = { latitude: number; longitude: number };

type Props = {
  language: "en" | "ar";
  /** The selected point, or null before anything is chosen (no pin is shown then). */
  pin: LatLon | null;
  /** Changes when the pin was moved from outside (search, GPS) so the map flies to it. */
  focusKey?: string | number;
  /** Lets the customer drag the pin or tap the map to place it. */
  editable?: boolean;
  onPinMove?: (point: LatLon) => void;
  onReady?: () => void;
  onError?: () => void;
  interactive?: boolean;
  label: string;
  className?: string;
};

function pinElement(): HTMLDivElement {
  const element = document.createElement("div");
  element.className = "qatar-map__pin";
  element.setAttribute("aria-hidden", "true");
  element.innerHTML = '<svg viewBox="0 0 40 52" width="40" height="52"><path d="M20 51c0 0-17-17.5-17-30.2C3 10.4 10.6 2.5 20 2.5S37 10.4 37 20.8C37 33.5 20 51 20 51z" fill="#a7c957" stroke="#0f1311" stroke-width="2.5"/><circle cx="20" cy="20.5" r="7" fill="#0f1311"/><circle cx="20" cy="20.5" r="3.2" fill="#f6f1d6"/></svg>';
  return element;
}

const reducedMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** The QLeaves dark Qatar map with one delivery pin. MapLibre is loaded the first time a map is shown. */
export function QatarMap({ language, pin, focusKey, editable = false, onPinMove, onReady, onError, interactive = true, label, className }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const callbacks = useRef({ onPinMove, onReady, onError, editable });
  callbacks.current = { onPinMove, onReady, onError, editable };
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const ready = useRef(false);
  const [modules, setModules] = useState<Awaited<ReturnType<typeof loadMap>> | null>(null);

  // One map per component: created once, removed with every listener when the component goes away.
  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | null = null;
    loadMap().then((loaded) => {
      if (cancelled || !container.current) return;
      setModules(loaded);
      const { maplibre } = loaded;
      created = new maplibre.Map({
        container: container.current,
        style: qatarStyle(language),
        bounds: pin ? undefined : QATAR_VIEW.bounds,
        center: pin ? [pin.longitude, pin.latitude] : QATAR_VIEW.center,
        zoom: pin ? 16 : QATAR_VIEW.zoom,
        maxBounds: QATAR_MAX_BOUNDS,
        minZoom: 6.5,
        maxZoom: 18,
        attributionControl: { compact: false },
        interactive,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        cooperativeGestures: false,
      });
      created.touchZoomRotate.disableRotation();
      created.keyboard.disableRotation();
      if (interactive) created.addControl(new maplibre.NavigationControl({ showCompass: false }), language === "ar" ? "top-left" : "top-right");
      created.on("load", () => { if (!cancelled) { ready.current = true; setState("ready"); callbacks.current.onReady?.(); } });
      created.on("error", (event) => {
        // A missing tile now and then is not fatal; the style or the map file failing to load is.
        const message = String((event as { error?: { message?: string } }).error?.message ?? "");
        if (!created?.isStyleLoaded() || /pmtiles|Failed to fetch|NetworkError|404/.test(message)) {
          if (!cancelled && !ready.current) { setState("error"); callbacks.current.onError?.(); }
        }
      });
      created.on("click", (event) => {
        if (!callbacks.current.editable) return;
        callbacks.current.onPinMove?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
      });
      map.current = created;
    }).catch(() => {
      if (!cancelled) { setState("error"); callbacks.current.onError?.(); }
    });
    return () => {
      cancelled = true;
      marker.current?.remove();
      marker.current = null;
      created?.remove();
      map.current = null;
    };
    // The map is created once; the pin, language and editing are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Place, move or remove the pin.
  useEffect(() => {
    const current = map.current;
    if (!current || !modules) return;
    if (!pin) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      marker.current = new modules.maplibre.Marker({ element: pinElement(), anchor: "bottom", draggable: editable })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(current);
      marker.current.on("dragend", () => {
        const point = marker.current?.getLngLat();
        if (point) callbacks.current.onPinMove?.({ latitude: point.lat, longitude: point.lng });
      });
    } else {
      marker.current.setLngLat([pin.longitude, pin.latitude]);
    }
    marker.current.setDraggable(editable);
    marker.current.getElement().classList.toggle("is-editable", editable);
  }, [pin, editable, modules, state]);

  // Fly to a point chosen elsewhere (search result, current location).
  useEffect(() => {
    const current = map.current;
    if (!current || !pin || focusKey === undefined) return;
    const target = { center: [pin.longitude, pin.latitude] as [number, number], zoom: Math.max(current.getZoom(), 16) };
    if (reducedMotion()) current.jumpTo(target); else current.flyTo({ ...target, duration: 900, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, state]);

  return (
    <div className={`qatar-map${className ? ` ${className}` : ""}`} data-state={state} dir="ltr">
      <div ref={container} className="qatar-map__canvas" role="region" aria-label={label} />
      {state === "loading" ? <div className="qatar-map__status" aria-hidden="true"><span className="qatar-map__spinner" /></div> : null}
      {state === "error" ? (
        <div className="qatar-map__status qatar-map__status--error" role="status">
          {language === "ar" ? "تعذر تحميل الخريطة الآن." : "The map could not be loaded right now."}
        </div>
      ) : null}
      {pin && state === "ready" ? (
        <button type="button" className={`qatar-map__recentre${language === "ar" ? " qatar-map__recentre--end" : ""}`} onClick={() => map.current?.easeTo({ center: [pin.longitude, pin.latitude], zoom: Math.max(map.current.getZoom(), 16), duration: reducedMotion() ? 0 : 500 })}>
          {language === "ar" ? "العودة إلى الدبوس" : "Back to pin"}
        </button>
      ) : null}
    </div>
  );
}

export default QatarMap;
