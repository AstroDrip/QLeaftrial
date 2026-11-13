// Qatar geography for delivery locations: the boundary check the server trusts, and address search / "nearest
// address" over the Qatar place index (built from the same OpenStreetMap map the customer sees; see
// scripts/maps/build-qatar-places.ts). Everything runs inside this API: no third-party geocoder, no per-request cost.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProductSearchIndex, searchProductIndex, type ProductSearchIndex } from "../product-search.js";

type Ring = Array<[number, number]>;
const here = dirname(fileURLToPath(import.meta.url));
// Next to this module in development; on Vercel the files are shipped at their repository path (vercel.json
// includeFiles), which is also tried in case the function was compiled to another folder.
function read<T>(name: string): T {
  const candidates = [resolve(here, name), resolve(process.cwd(), "apps/api/src/lib/geo", name), resolve(process.cwd(), "src/lib/geo", name)];
  for (const path of candidates) {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as T;
  }
  throw new Error(`Qatar geo data file missing: ${name}`);
}

// ---------- Boundary ----------
const boundary = read<{ coordinates: Array<Ring[]> }>("qatar-boundary.json");

/** Point-in-polygon (even-odd rule) against Qatar's boundary, islands and territorial waters included. */
export function isInQatar(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  for (const polygon of boundary.coordinates) {
    let inside = false;
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > latitude !== yj > latitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

// ---------- Place index ----------
export type PlaceKind = "area" | "landmark" | "street";
/** How exactly a result pins a door: an area or street is only approximate; a landmark is a specific place. */
export type Precision = "area" | "street" | "landmark";
export type Place = { id: string; kind: PlaceKind; type: string; en: string; ar: string; latitude: number; longitude: number };
export type PlaceResult = Place & { label: string; context: string; precision: Precision };
export type ReverseResult = { formattedAddress: string; area: string | null; street: string | null; landmark: string | null; precision: Precision | "none" };

type RawIndex = {
  areas: Array<[string, string, string, number, number]>;
  landmarks: Array<[string, string, string, number, number]>;
  streets: Array<[string, string, string, number[]]>;
  pointOrigin: [number, number, number];
};

type Loaded = {
  places: Place[];
  byId: Map<string, Place>;
  search: ProductSearchIndex;
  grid: Map<string, Array<{ place: Place; latitude: number; longitude: number }>>;
};
let loaded: Loaded | null = null;
const CELL = 0.01; // about 1.1 km
const cellKey = (lat: number, lon: number) => `${Math.floor(lat / CELL)},${Math.floor(lon / CELL)}`;

function load(): Loaded {
  if (loaded) return loaded;
  const raw = read<RawIndex>("qatar-places.json");
  const [originLon, originLat, scale] = raw.pointOrigin;
  const places: Place[] = [];
  const grid: Loaded["grid"] = new Map();
  const add = (cellPlace: Place, latitude: number, longitude: number) => {
    const key = cellKey(latitude, longitude);
    const bucket = grid.get(key);
    if (bucket) bucket.push({ place: cellPlace, latitude, longitude }); else grid.set(key, [{ place: cellPlace, latitude, longitude }]);
  };
  raw.areas.forEach(([en, ar, type, lon, lat], i) => {
    const place: Place = { id: `a${i}`, kind: "area", type, en, ar, latitude: lat, longitude: lon };
    places.push(place); add(place, lat, lon);
  });
  raw.landmarks.forEach(([en, ar, type, lon, lat], i) => {
    const place: Place = { id: `l${i}`, kind: "landmark", type, en, ar, latitude: lat, longitude: lon };
    places.push(place); add(place, lat, lon);
  });
  raw.streets.forEach(([en, ar, type, points], i) => {
    const coords: Array<[number, number]> = [];
    for (let p = 0; p < points.length; p += 2) coords.push([originLat + points[p + 1] / scale, originLon + points[p] / scale]);
    // A street's own position is its point nearest the middle of the stretch.
    const mid = coords.reduce((acc, [lat, lon]) => [acc[0] + lat / coords.length, acc[1] + lon / coords.length], [0, 0]);
    const centre = coords.reduce((best, c) => (distanceMetres(c[0], c[1], mid[0], mid[1]) < distanceMetres(best[0], best[1], mid[0], mid[1]) ? c : best), coords[0]);
    const place: Place = { id: `s${i}`, kind: "street", type, en, ar, latitude: centre[0], longitude: centre[1] };
    places.push(place);
    for (const [lat, lon] of coords) add(place, lat, lon);
  });
  const search = buildProductSearchIndex(places.map((place) => ({ id: place.id, name: place.en || place.ar, nameAr: place.ar, category: place.kind === "street" ? "street" : place.kind === "area" ? "area" : place.type.split("/")[0] })));
  loaded = { places, byId: new Map(places.map((place) => [place.id, place])), search, grid };
  return loaded;
}

export function distanceMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const k = Math.PI / 180;
  const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  const y = (lat2 - lat1) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

function nearest(latitude: number, longitude: number, kind: PlaceKind, withinMetres: number): { place: Place; metres: number } | null {
  const { grid } = load();
  const reach = Math.ceil(withinMetres / 1100) + 1;
  const [cy, cx] = cellKey(latitude, longitude).split(",").map(Number);
  let best: { place: Place; metres: number } | null = null;
  for (let dy = -reach; dy <= reach; dy += 1) for (let dx = -reach; dx <= reach; dx += 1) {
    for (const entry of grid.get(`${cy + dy},${cx + dx}`) ?? []) {
      if (entry.place.kind !== kind) continue;
      const metres = distanceMetres(latitude, longitude, entry.latitude, entry.longitude);
      if (metres <= withinMetres && (!best || metres < best.metres)) best = { place: entry.place, metres };
    }
  }
  return best;
}

const nameIn = (place: Place, language: "en" | "ar") => (language === "ar" ? place.ar || place.en : place.en || place.ar);

/** The nearest area name for a point (within 4 km), used as the "where" part of every result. */
function areaFor(latitude: number, longitude: number, language: "en" | "ar"): string | null {
  const hit = nearest(latitude, longitude, "area", 4000);
  return hit ? nameIn(hit.place, language) : null;
}

const KIND_BONUS: Record<PlaceKind, number> = { area: 4, landmark: 1.5, street: 0 };

/** Qatar places matching a query (English, Arabic, mixed, partial, small typos), best first. */
export function searchPlaces(query: string, language: "en" | "ar", options: { near?: { latitude: number; longitude: number }; limit?: number } = {}): PlaceResult[] {
  const { search, byId } = load();
  const hits = searchProductIndex(search, query);
  const scored = hits.slice(0, 200).flatMap((hit) => {
    const place = byId.get(hit.id);
    if (!place) return [];
    let score = hit.score + KIND_BONUS[place.kind];
    // Car parks, gates and entrances share their name with the place itself; the place should come first.
    if (/parking|entrance|gate/.test(place.type) || /(parking|car park|gate)/i.test(place.en)) score -= 3;
    // A gentle preference for places near the map's centre, never enough to beat a clearly better name match.
    if (options.near) score += Math.max(0, 3 - distanceMetres(options.near.latitude, options.near.longitude, place.latitude, place.longitude) / 5000);
    return [{ place, score }];
  });
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const results: PlaceResult[] = [];
  for (const { place } of scored) {
    const label = nameIn(place, language);
    const area = place.kind === "area" ? null : areaFor(place.latitude, place.longitude, language);
    const key = `${label}|${area ?? ""}|${place.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ ...place, label, context: [area, language === "ar" ? "قطر" : "Qatar"].filter(Boolean).join(language === "ar" ? "، " : ", "), precision: place.kind });
    if (results.length >= (options.limit ?? 6)) break;
  }
  return results;
}

/** The nearest named place to a point: a landmark within 40 m, the street within 120 m, and the area. */
export function reverseGeocode(latitude: number, longitude: number, language: "en" | "ar"): ReverseResult {
  const landmark = nearest(latitude, longitude, "landmark", 40);
  const street = nearest(latitude, longitude, "street", 120);
  const area = areaFor(latitude, longitude, language);
  const parts = [landmark && nameIn(landmark.place, language), street && nameIn(street.place, language), area, language === "ar" ? "قطر" : "Qatar"].filter(Boolean) as string[];
  return {
    formattedAddress: [...new Set(parts)].join(language === "ar" ? "، " : ", "),
    area,
    street: street ? nameIn(street.place, language) : null,
    landmark: landmark ? nameIn(landmark.place, language) : null,
    precision: landmark ? "landmark" : street ? "street" : area ? "area" : "none",
  };
}

/** Loads the index ahead of the first request (optional; it also loads lazily). */
export function warmPlaceIndex(): number {
  return load().places.length;
}
