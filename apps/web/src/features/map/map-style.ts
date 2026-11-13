import { layers, namedFlavor, type Flavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

// The Qatar map file (built by apps/api/scripts/maps/extract-qatar-map.ts). Served as a static file by default, so
// the browser reads only the parts it needs with HTTP range requests; VITE_QATAR_MAP_URL can point elsewhere.
export const QATAR_MAP_URL: string = import.meta.env.VITE_QATAR_MAP_URL || "/maps/qatar.pmtiles";
export const MAP_ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>';

// Qatar, framed for a first look; never used as anyone's location.
export const QATAR_VIEW = { center: [51.2, 25.3] as [number, number], zoom: 7.4, bounds: [[50.55, 24.45], [51.75, 26.2]] as [[number, number], [number, number]] };
export const QATAR_MAX_BOUNDS: [[number, number], [number, number]] = [[49.9, 24.0], [52.7, 26.7]];

// QLeaves dark: deep charcoal land, a quiet road hierarchy where main roads read lighter than streets, dark moss
// parks, muted blue-green water, and labels in the site's cream at low contrast so the pin stays the brightest thing.
const QLEAVES_DARK: Flavor = {
  ...namedFlavor("dark"),
  background: "#0f1311",
  earth: "#151a17",
  park_a: "#18241b",
  park_b: "#1a281d",
  wood_a: "#18221b",
  wood_b: "#18221b",
  scrub_a: "#171d19",
  scrub_b: "#171d19",
  sand: "#1b1f1b",
  beach: "#1e231e",
  hospital: "#1a1d1b",
  school: "#1a1d1b",
  industrial: "#171b19",
  aerodrome: "#191d1b",
  runway: "#262c28",
  pedestrian: "#1a1f1c",
  water: "#0d2026",
  buildings: "#20261f",
  minor_service: "#232a26",
  minor_a: "#29302c",
  minor_b: "#29302c",
  other: "#232a26",
  link: "#353d38",
  major: "#3b443e",
  highway: "#4a5550",
  minor_service_casing: "#151a17",
  minor_casing: "#151a17",
  link_casing: "#151a17",
  major_casing_early: "#151a17",
  major_casing_late: "#151a17",
  highway_casing_early: "#151a17",
  highway_casing_late: "#151a17",
  railway: "#2b322e",
  boundaries: "#56625b",
  roads_label_minor: "#8d978f",
  roads_label_minor_halo: "#0f1311",
  roads_label_major: "#a9b3aa",
  roads_label_major_halo: "#0f1311",
  subplace_label: "#9fab9f",
  subplace_label_halo: "#0f1311",
  city_label: "#e6e2c8",
  city_label_halo: "#0f1311",
  state_label: "#7c877f",
  state_label_halo: "#0f1311",
  country_label: "#7c877f",
  ocean_label: "#46646b",
  address_label: "#7c877f",
  address_label_halo: "#0f1311",
  regular: "Noto Sans Regular",
  bold: "Noto Sans Medium",
  italic: "Noto Sans Italic",
};

// Without an icon sheet: one-way arrows and road shields are left out, and places keep their names without icons.
const ICONLESS_DROP = new Set(["roads_oneway", "roads_shields"]);

export function qatarStyle(language: "en" | "ar"): StyleSpecification {
  const styleLayers = layers("qatar", QLEAVES_DARK, { lang: language })
    .filter((layer) => !ICONLESS_DROP.has(layer.id))
    .map((layer) => {
      if (layer.type !== "symbol" || !layer.layout || !("icon-image" in layer.layout)) return layer;
      const { "icon-image": _icon, ...layout } = layer.layout as Record<string, unknown>;
      return { ...layer, layout } as typeof layer;
    });
  return {
    version: 8,
    glyphs: `${window.location.origin}/maps/fonts/{fontstack}/{range}.pbf`,
    sources: {
      qatar: { type: "vector", url: `pmtiles://${new URL(QATAR_MAP_URL, window.location.origin).href}`, attribution: MAP_ATTRIBUTION },
    },
    layers: styleLayers,
  } as StyleSpecification;
}
