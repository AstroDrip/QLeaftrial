// Copies the map label fonts (glyph files) the Qatar map style needs into the web app, so the map loads no assets
// from third-party servers at runtime. Only the character ranges used in Qatar are fetched: Latin, punctuation and
// Arabic (with its presentation forms).
//   npx tsx scripts/maps/fetch-map-fonts.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../../web/public/maps/fonts");
const SOURCE = "https://protomaps.github.io/basemaps-assets/fonts";
const FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
const RANGES = ["0-255", "256-511", "1536-1791", "1792-2047", "2048-2303", "8192-8447", "64256-64511", "64512-64767", "64768-65023", "65024-65279"];

let total = 0;
for (const font of FONTS) {
  mkdirSync(resolve(OUT, font), { recursive: true });
  for (const range of RANGES) {
    const response = await fetch(`${SOURCE}/${encodeURIComponent(font)}/${range}.pbf`);
    if (!response.ok) { console.log(`skip ${font} ${range}: ${response.status}`); continue; }
    const bytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(resolve(OUT, font, `${range}.pbf`), bytes);
    total += bytes.length;
  }
}
console.log(`fonts written to ${OUT}: ${(total / 1024).toFixed(0)} KB`);
