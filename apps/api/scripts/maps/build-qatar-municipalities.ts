// Fetches the outlines of Qatar's eight municipalities (OpenStreetMap administrative boundaries, admin_level 4) and
// stores them for the "which municipality is this pin in?" check: it fills checkout's delivery-area field and tells
// the admin when a pin is outside the areas QLeaves delivers to. Coordinates are rounded to 1/10,000 of a degree
// (about 11 m), which is plenty for municipal borders.
//   npx tsx scripts/maps/build-qatar-municipalities.ts
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../src/lib/geo/qatar-municipalities.json");

// OpenStreetMap relation ids (found with an Overpass query for admin_level=4 boundaries inside relation 305095).
const MUNICIPALITIES: Array<{ id: number; en: string; ar: string }> = [
  { id: 27332, en: "Doha", ar: "الدوحة" },
  { id: 27331, en: "Al Rayyan", ar: "الريان" },
  { id: 27337, en: "Al Wakrah", ar: "الوكرة" },
  { id: 27329, en: "Al Khor and Al Thakhira", ar: "الخور والذخيرة" },
  { id: 27328, en: "Umm Salal", ar: "أم صلال" },
  { id: 11146904, en: "Al Daayen", ar: "الضعاين" },
  { id: 27335, en: "Al Shamal", ar: "الشمال" },
  { id: 27330, en: "Al Shahaniya", ar: "الشحانية" },
];

type Ring = Array<[number, number]>;
const round = (value: number) => Math.round(value * 1e4) / 1e4;

const output = [];
for (const municipality of MUNICIPALITIES) {
  const response = await fetch(`https://polygons.openstreetmap.fr/get_geojson.py?id=${municipality.id}&params=0`);
  if (!response.ok) throw new Error(`${municipality.en}: ${response.status}`);
  const data = await response.json() as { type: string; coordinates?: Ring[][]; geometries?: Array<{ coordinates: Ring[][] }> };
  const polygons = data.geometries ? data.geometries[0].coordinates : data.coordinates!;
  const simplified = polygons.map((polygon) => polygon.map((ring) => {
    const points: Ring = [];
    for (const [lon, lat] of ring) {
      const point: [number, number] = [round(lon), round(lat)];
      const last = points[points.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) points.push(point);
    }
    return points;
  }));
  output.push({ ...municipality, coordinates: simplified });
  console.log(`${municipality.en}: ${simplified.length} parts, ${simplified.flat(2).length} points`);
}
writeFileSync(OUT, JSON.stringify({ source: "OpenStreetMap contributors (ODbL), admin_level 4 boundaries via polygons.openstreetmap.fr", fetched: new Date().toISOString(), municipalities: output }));
console.log(`wrote ${OUT}`);
