// Builds the Qatar place index used for address search and "nearest address" lookups, from the same OpenStreetMap
// map archive the storefront shows (so search results and the map always agree). It reads every tile of the
// archive and keeps named areas, landmarks and streets with their English and Arabic names. Nothing is invented:
// a place without a name in the data is not indexed, and there are no house numbers (OpenStreetMap has few in Qatar).
//   npx tsx scripts/maps/build-qatar-places.ts [path/to/qatar.pmtiles]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";

const here = dirname(fileURLToPath(import.meta.url));
const input = resolve(process.argv[2] ?? resolve(here, "../../../web/public/maps/qatar.pmtiles"));
const output = resolve(here, "../../src/lib/geo/qatar-places.json");
const file = readFileSync(input);
const source: Source = {
  getKey: () => input,
  getBytes: async (offset, length) => {
    const slice = file.subarray(offset, offset + length);
    return { data: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer };
  },
};
const archive = new PMTiles(source);

// Kinds worth finding at checkout. Street furniture, trees, crossings and the like are left out.
const SKIP_POI = new Set(["tree", "crossing", "traffic_signals", "speed_camera", "parking_entrance", "bus_stop", "information", "artwork", "bench", "waste_basket", "drinking_water", "street_lamp", "fire_hydrant", "toilets", "atm", "vending_machine", "parking_space", "bicycle_parking", "footway", "construction", "military", "tower", "mast", "survey_point", "gate"]);
const ROAD_KINDS = new Set(["highway", "major_road", "minor_road"]);
const AREA_KINDS = new Set(["locality", "neighbourhood", "macrohood", "region"]);

const r5 = (value: number) => Math.round(value * 1e5) / 1e5;
const lonOf = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const latOf = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const tileXY = (lon: number, lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * 2 ** z), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)];
};
const metres = (a: [number, number], b: [number, number]) => {
  const k = Math.PI / 180;
  const x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * k);
  const y = (b[1] - a[1]) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
};

type Named = { en: string; ar: string; local: string };
type Point = Named & { kind: string; detail: string; lon: number; lat: number; rank: number };
const areas = new Map<string, Point>();
const landmarks = new Map<string, Point>();
const streets = new Map<string, { names: Named; kind: string; points: Map<string, [number, number]> }>();

function names(p: Record<string, unknown>): Named | null {
  const local = String(p.name ?? "").trim();
  const en = String(p["name:en"] ?? "").trim();
  const ar = String(p["name:ar"] ?? "").trim();
  if (!local && !en && !ar) return null;
  const arabic = /[؀-ۿ]/;
  return { en: en || (arabic.test(local) ? "" : local), ar: ar || (arabic.test(local) ? local : ""), local };
}

async function readTile(z: number, x: number, y: number) {
  const tile = await archive.getZxy(z, x, y);
  if (!tile?.data) return;
  const vt = new VectorTile(new PbfReader(new Uint8Array(tile.data)));
  const toLonLat = (px: number, py: number, extent: number): [number, number] => [
    r5(lonOf(x + px / extent, z)), r5(latOf(y + py / extent, z)),
  ];

  for (const layerName of ["places", "pois"]) {
    const layer = vt.layers[layerName];
    for (let i = 0; layer && i < layer.length; i += 1) {
      const feature = layer.feature(i);
      const p = feature.properties as Record<string, unknown>;
      const n = names(p);
      if (!n) continue;
      const kind = String(p.kind ?? "");
      const isArea = layerName === "places" ? AREA_KINDS.has(kind) : kind === "administrative";
      if (!isArea && (layerName === "places" || SKIP_POI.has(kind))) continue;
      const geometry = feature.loadGeometry();
      const first = geometry[0]?.[0];
      if (!first) continue;
      // Points use their position; polygons (a few POIs) use the average of their outline.
      const ring = geometry[0];
      const mx = ring.reduce((sum, pt) => sum + pt.x, 0) / ring.length;
      const my = ring.reduce((sum, pt) => sum + pt.y, 0) / ring.length;
      if (mx < 0 || my < 0 || mx > layer.extent || my > layer.extent) continue; // label of a neighbouring tile
      const [lon, lat] = toLonLat(mx, my, layer.extent);
      const point: Point = { ...n, kind: isArea && layerName === "pois" ? "area" : kind, detail: String(p.kind_detail ?? ""), lon, lat, rank: Number(p.population_rank ?? p.min_zoom ?? 0) };
      const target = isArea ? areas : landmarks;
      const key = `${(n.en || n.ar).toLowerCase()}|${Math.round(lon * 200)}|${Math.round(lat * 200)}`;
      if (!target.has(key)) target.set(key, point);
    }
  }

  const roads = vt.layers.roads;
  for (let i = 0; roads && i < roads.length; i += 1) {
    const feature = roads.feature(i);
    const p = feature.properties as Record<string, unknown>;
    if (!ROAD_KINDS.has(String(p.kind ?? ""))) continue;
    const n = names(p);
    if (!n) continue;
    const key = (n.en || n.ar).toLowerCase();
    const entry = streets.get(key) ?? { names: n, kind: String(p.kind_detail || p.kind), points: new Map() };
    if (!entry.names.ar && n.ar) entry.names.ar = n.ar;
    if (!entry.names.en && n.en) entry.names.en = n.en;
    for (const line of feature.loadGeometry()) {
      for (let j = 0; j < line.length; j += 1) {
        const pt = line[j];
        if (pt.x < 0 || pt.y < 0 || pt.x > roads.extent || pt.y > roads.extent) continue;
        const [lon, lat] = toLonLat(pt.x, pt.y, roads.extent);
        // About one point every 30 m along a street is plenty for "nearest street".
        entry.points.set(`${Math.round(lon * 3333)},${Math.round(lat * 3333)}`, [lon, lat]);
        if (j > 0) {
          const prev = line[j - 1];
          const steps = Math.floor(Math.hypot(pt.x - prev.x, pt.y - prev.y) / 40);
          for (let s = 1; s < steps; s += 1) {
            const [ilon, ilat] = toLonLat(prev.x + ((pt.x - prev.x) * s) / steps, prev.y + ((pt.y - prev.y) * s) / steps, roads.extent);
            entry.points.set(`${Math.round(ilon * 3333)},${Math.round(ilat * 3333)}`, [ilon, ilat]);
          }
        }
      }
    }
    streets.set(key, entry);
  }
}

async function main() {
  const header = await archive.getHeader();
  const bounds = { west: header.minLon, south: header.minLat, east: header.maxLon, north: header.maxLat };
  // Area names are labelled at several zooms; streets and landmarks are complete at the deepest zoom.
  for (const z of [10, 12, 14, header.maxZoom]) {
    const [x0, y0] = tileXY(bounds.west, bounds.north, z);
    const [x1, y1] = tileXY(bounds.east, bounds.south, z);
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) await readTile(z, x, y);
    console.log(`z${z}: areas ${areas.size}, landmarks ${landmarks.size}, street names ${streets.size}`);
  }

  // A street name used in several places (e.g. "Street 820") becomes one entry per stretch, split where there is
  // more than 1.5 km between its points.
  const streetEntries: Array<{ en: string; ar: string; kind: string; points: number[] }> = [];
  for (const entry of streets.values()) {
    const points = [...entry.points.values()];
    const groups: Array<Array<[number, number]>> = [];
    for (const point of points) {
      const group = groups.find((g) => g.some((q) => metres(q, point) < 1500));
      if (group) group.push(point); else groups.push([point]);
    }
    // Points are stored as whole numbers: 1/10,000 of a degree (about 11 m) east of 50.5 E and north of 24.4 N.
    for (const group of groups) streetEntries.push({ en: entry.names.en, ar: entry.names.ar, kind: entry.kind, points: group.flatMap(([lon, lat]) => [Math.round((lon - 50.5) * 1e4), Math.round((lat - 24.4) * 1e4)]) });
  }

  const index = {
    version: 1,
    source: "OpenStreetMap contributors (ODbL), via the QLeaves Qatar map archive",
    built: new Date().toISOString(),
    // [en, ar, kind, lon, lat]
    areas: [...areas.values()].map((a) => [a.en, a.ar, a.kind, a.lon, a.lat]),
    // [en, ar, kind/detail, lon, lat]
    landmarks: [...landmarks.values()].map((l) => [l.en, l.ar, l.detail ? `${l.kind}/${l.detail}` : l.kind, l.lon, l.lat]),
    // [en, ar, kind, [x, y, x, y, ...]] with lon = 50.5 + x / 1e4 and lat = 24.4 + y / 1e4
    pointOrigin: [50.5, 24.4, 1e4],
    streets: streetEntries.map((s) => [s.en, s.ar, s.kind, s.points]),
  };
  writeFileSync(output, JSON.stringify(index));
  const size = Buffer.byteLength(JSON.stringify(index));
  console.log(`wrote ${output}: ${(size / 1048576).toFixed(2)} MB; ${index.areas.length} areas, ${index.landmarks.length} landmarks, ${index.streets.length} street stretches, ${streetEntries.reduce((n, s) => n + s.points.length / 2, 0)} street points`);
}

main().catch((error) => { console.error("FAILED", error); process.exit(1); });
