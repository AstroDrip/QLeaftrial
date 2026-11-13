// Lists the fields and kinds present in Qatar map tiles (used while building the place index).
import { readFileSync } from "node:fs";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PMTiles, type Source } from "pmtiles";

const file = readFileSync("../web/public/maps/qatar.pmtiles");
const source: Source = {
  getKey: () => "qatar",
  getBytes: async (offset, length) => {
    const slice = file.subarray(offset, offset + length);
    return { data: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer };
  },
};
const archive = new PMTiles(source);
const xy = (lon: number, lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * 2 ** z), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)];
};

for (const z of [12, 15]) {
  const [x, y] = xy(51.531, 25.322, z);
  const tile = await archive.getZxy(z, x, y);
  const vt = new VectorTile(new PbfReader(new Uint8Array(tile!.data)));
  for (const name of ["places", "pois", "roads"]) {
    const layer = vt.layers[name];
    if (!layer) continue;
    const keys = new Set<string>();
    const kinds = new Map<string, number>();
    const examples: string[] = [];
    for (let i = 0; i < layer.length; i += 1) {
      const p = layer.feature(i).properties;
      for (const key of Object.keys(p)) if (!key.startsWith("name:") || key === "name:en" || key === "name:ar") keys.add(key);
      kinds.set(`${p.kind}/${p.kind_detail ?? ""}`, (kinds.get(`${p.kind}/${p.kind_detail ?? ""}`) ?? 0) + 1);
      if (p.name && examples.length < 3) examples.push(`${p.name} | en=${p["name:en"] ?? "-"} | ar=${p["name:ar"] ?? "-"} | ${p.kind}/${p.kind_detail ?? ""}`);
    }
    console.log(`z${z} ${name}: keys ${[...keys].join(",")}`);
    console.log(`  kinds ${[...kinds].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${k}:${n}`).join(" ")}`);
    console.log(`  e.g. ${examples.join("  ||  ")}`);
  }
}
