// Checks a built Qatar map archive: header, metadata and real tiles at places across the country.
//   npx tsx scripts/maps/inspect-qatar-map.ts [path/to/qatar.pmtiles]
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader as Pbf } from "pbf";
import { PMTiles, type RangeResponse, type Source } from "pmtiles";

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(process.argv[2] ?? resolve(here, "../../../web/public/maps/qatar.pmtiles"));
const file = readFileSync(path);

class BufferSource implements Source {
  getKey() { return path; }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const slice = file.subarray(offset, offset + length);
    return { data: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer };
  }
}

const PLACES: Array<[string, number, number]> = [
  ["Doha (West Bay)", 51.531, 25.322], ["Doha (Souq Waqif)", 51.533, 25.287], ["Lusail", 51.517, 25.42], ["The Pearl", 51.551, 25.371],
  ["Al Rayyan", 51.42, 25.29], ["Al Wakrah", 51.6, 25.17], ["Al Wukair", 51.48, 25.15], ["Umm Salal", 51.4, 25.41],
  ["Al Khor", 51.5, 25.68], ["Al Daayen", 51.48, 25.48], ["Dukhan", 50.78, 25.43], ["Mesaieed", 51.55, 24.99], ["Al Shamal (Madinat ash Shamal)", 51.2, 26.12],
];
const tileXY = (lon: number, lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * 2 ** z), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)];
};

async function main() {
  const archive = new PMTiles(new BufferSource());
  const header = await archive.getHeader();
  const metadata = (await archive.getMetadata()) as { vector_layers?: Array<{ id: string }>; attribution?: string; qleaves_source?: unknown };
  console.log(`file ${(file.length / 1048576).toFixed(2)} MB; zoom ${header.minZoom}-${header.maxZoom}; tiles ${header.numAddressedTiles}; bounds ${header.minLon},${header.minLat} .. ${header.maxLon},${header.maxLat}`);
  console.log(`layers: ${metadata.vector_layers?.map((layer) => layer.id).join(", ")}`);
  console.log(`attribution: ${metadata.attribution}`);
  console.log(`source: ${JSON.stringify(metadata.qleaves_source)}`);
  for (const [name, lon, lat] of PLACES) {
    const row: string[] = [];
    for (const z of [12, 14, 15]) {
      const [x, y] = tileXY(lon, lat, z);
      const tile = await archive.getZxy(z, x, y);
      if (!tile?.data) { row.push(`z${z}: MISSING`); continue; }
      // The library has already decompressed the tile.
      const bytes = new Uint8Array(tile.data);
      const vt = new VectorTile(new Pbf(bytes));
      const count = (layer: string) => vt.layers[layer]?.length ?? 0;
      let named = 0, arabic = 0;
      for (const layer of ["roads", "places", "pois"]) {
        const l = vt.layers[layer];
        for (let i = 0; l && i < l.length; i += 1) { const p = l.feature(i).properties; if (p.name) named += 1; if (p["name:ar"]) arabic += 1; }
      }
      row.push(`z${z}: roads ${count("roads")}, buildings ${count("buildings")}, pois ${count("pois")}, places ${count("places")}, water ${count("water")}, named ${named} (ar ${arabic})`);
    }
    console.log(`${name}\n  ${row.join("\n  ")}`);
  }
}
main().catch((error) => { console.error("FAILED", error); process.exit(1); });
