// Builds the Qatar map archive (PMTiles v3) from a Protomaps daily OpenStreetMap build.
//
//   npx tsx scripts/maps/extract-qatar-map.ts plan  [--build=YYYYMMDD]          sizes per max zoom, no tile download
//   npx tsx scripts/maps/extract-qatar-map.ts build --maxzoom=14 [--build=...] [--out=path]
//
// Only the tiles that touch Qatar's boundary (OpenStreetMap relation 305095, with a one-tile margin so the coast is
// never clipped) are copied. The source archive is read with HTTP range requests: first its index, then the tile
// bytes in large merged ranges, the way the official `pmtiles extract` command does. Tiles are copied unchanged
// (OpenStreetMap data, ODbL; Protomaps basemap schema). Nothing is invented or added.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { bytesToHeader, tileIdToZxy, zxyToTileId } from "pmtiles";

const here = dirname(fileURLToPath(import.meta.url));
const BOUNDARY = resolve(here, "qatar-boundary.geojson");
const args = Object.fromEntries(process.argv.slice(3).map((arg) => arg.replace(/^--/, "").split("=")) as Array<[string, string]>);
const mode = process.argv[2] ?? "plan";

type Ring = Array<[number, number]>;
type Entry = { tileId: number; offset: number; length: number; runLength: number };

// ---------- Boundary and tile cover ----------
const boundary = JSON.parse(readFileSync(BOUNDARY, "utf8")) as { coordinates: Array<Ring[]> } | { geometries: Array<{ coordinates: Array<Ring[]> }> };
const polygons: Array<Ring[]> = "geometries" in boundary ? boundary.geometries[0].coordinates : boundary.coordinates;
const rings: Ring[] = polygons.flat();

function inside(lon: number, lat: number): boolean {
  let hit = false;
  for (const polygon of polygons) {
    let inPolygon = false;
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inPolygon = !inPolygon;
      }
    }
    if (inPolygon) hit = true;
  }
  return hit;
}

const lonOf = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const latOf = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const xOf = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const yOf = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function tileTouchesQatar(x: number, y: number, z: number): boolean {
  const west = lonOf(x, z), east = lonOf(x + 1, z), north = latOf(y, z), south = latOf(y + 1, z);
  // A corner or the centre inside Qatar, or a boundary vertex inside the tile.
  for (const [lon, lat] of [[west, north], [east, north], [west, south], [east, south], [(west + east) / 2, (north + south) / 2]]) if (inside(lon, lat)) return true;
  for (const ring of rings) for (const [lon, lat] of ring) if (lon >= west && lon <= east && lat >= south && lat <= north) return true;
  return false;
}

const all = rings.flat();
const bbox = { west: Math.min(...all.map((p) => p[0])), east: Math.max(...all.map((p) => p[0])), south: Math.min(...all.map((p) => p[1])), north: Math.max(...all.map((p) => p[1])) };

function tilesFor(maxZoom: number): number[] {
  const ids: number[] = [];
  for (let z = 0; z <= maxZoom; z += 1) {
    const x0 = xOf(bbox.west, z), x1 = xOf(bbox.east, z), y0 = yOf(bbox.north, z), y1 = yOf(bbox.south, z);
    const keep = new Set<string>();
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) {
      if (!tileTouchesQatar(x, y, z)) continue;
      // One-tile margin around every touching tile, so coastline and border features are never cut.
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < 2 ** z && ny < 2 ** z) keep.add(`${nx},${ny}`);
      }
    }
    for (const key of keep) { const [x, y] = key.split(",").map(Number); ids.push(zxyToTileId(z, x, y)); }
  }
  return ids.sort((a, b) => a - b);
}

// ---------- Reading the source archive ----------
let requests = 0;
let bytesRead = 0;
async function range(url: string, offset: number, length: number): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}`, "User-Agent": "qleaves-map-extract/1.0" } });
      if (response.status !== 206) throw new Error(`expected 206, got ${response.status}`);
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.length !== length) throw new Error(`short read ${body.length}/${length}`);
      requests += 1; bytesRead += length;
      return body;
    } catch (error) {
      if (attempt >= 5) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

function varints(bytes: Uint8Array) {
  let position = 0;
  return () => {
    let value = 0, shift = 0, byte: number;
    do { byte = bytes[position++]; value += (byte & 0x7f) * 2 ** shift; shift += 7; } while (byte & 0x80);
    return value;
  };
}

function readDirectory(compressed: Uint8Array): Entry[] {
  const next = varints(gunzipSync(compressed));
  const count = next();
  const entries: Entry[] = Array.from({ length: count }, () => ({ tileId: 0, offset: 0, length: 0, runLength: 0 }));
  let last = 0;
  for (const entry of entries) { last += next(); entry.tileId = last; }
  for (const entry of entries) entry.runLength = next();
  for (const entry of entries) entry.length = next();
  entries.forEach((entry, i) => { const value = next(); entry.offset = value === 0 && i > 0 ? entries[i - 1].offset + entries[i - 1].length : value - 1; });
  return entries;
}

function findEntry(entries: Entry[], tileId: number): Entry | undefined {
  let lo = 0, hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].tileId < tileId) lo = mid + 1; else if (entries[mid].tileId > tileId) hi = mid - 1; else return entries[mid];
  }
  // A run (runLength > 0) or a leaf pointer (runLength 0) can start before the tile.
  const candidate = hi >= 0 ? entries[hi] : undefined;
  if (!candidate) return undefined;
  if (candidate.runLength === 0) return candidate;
  return tileId - candidate.tileId < candidate.runLength ? candidate : undefined;
}

async function openSource(url: string) {
  const start = await range(url, 0, 16384);
  const header = bytesToHeader(start.buffer.slice(start.byteOffset, start.byteOffset + 127) as ArrayBuffer, undefined);
  if (header.internalCompression !== 2) throw new Error(`unexpected internal compression ${header.internalCompression}`);
  const root = readDirectory(start.slice(header.rootDirectoryOffset, header.rootDirectoryOffset + header.rootDirectoryLength));
  const leaves = new Map<number, Entry[]>();
  async function locate(tileId: number): Promise<Entry | undefined> {
    let entries = root;
    for (let depth = 0; depth < 4; depth += 1) {
      const entry = findEntry(entries, tileId);
      if (!entry) return undefined;
      if (entry.runLength > 0) return entry;
      const key = entry.offset;
      if (!leaves.has(key)) leaves.set(key, readDirectory(await range(url, header.leafDirectoryOffset + entry.offset, entry.length)));
      entries = leaves.get(key)!;
    }
    return undefined;
  }
  const metadata = JSON.parse(gunzipSync(await range(url, header.jsonMetadataOffset, header.jsonMetadataLength)).toString("utf8"));
  return { header, locate, metadata };
}

// ---------- Writing the Qatar archive ----------
function writeVarint(out: number[], value: number) {
  while (value >= 0x80) { out.push((value % 0x80) | 0x80); value = Math.floor(value / 0x80); }
  out.push(value);
}
function serializeDirectory(entries: Entry[]): Buffer {
  const out: number[] = [];
  writeVarint(out, entries.length);
  let last = 0;
  for (const e of entries) { writeVarint(out, e.tileId - last); last = e.tileId; }
  for (const e of entries) writeVarint(out, e.runLength);
  for (const e of entries) writeVarint(out, e.length);
  entries.forEach((e, i) => writeVarint(out, i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length ? 0 : e.offset + 1));
  return gzipSync(Buffer.from(out), { level: 9 });
}
function directories(entries: Entry[]): { root: Buffer; leaves: Buffer } {
  const single = serializeDirectory(entries);
  if (single.length <= 16384 - 127) return { root: single, leaves: Buffer.alloc(0) };
  for (let leafSize = 4096; ; leafSize *= 2) {
    const rootEntries: Entry[] = [];
    const leafParts: Buffer[] = [];
    let offset = 0;
    for (let i = 0; i < entries.length; i += leafSize) {
      const leaf = serializeDirectory(entries.slice(i, i + leafSize));
      rootEntries.push({ tileId: entries[i].tileId, offset, length: leaf.length, runLength: 0 });
      leafParts.push(leaf); offset += leaf.length;
    }
    const root = serializeDirectory(rootEntries);
    if (root.length <= 16384 - 127) return { root, leaves: Buffer.concat(leafParts) };
  }
}
function u64(buffer: Buffer, at: number, value: number) { buffer.writeBigUInt64LE(BigInt(value), at); }

async function main() {
  const build = args.build ?? new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://build.protomaps.com/${build}.pmtiles`;
  const source = await openSource(url);
  console.log(`source ${url} (zoom ${source.header.minZoom}-${source.header.maxZoom}, tile compression ${source.header.tileCompression})`);

  if (mode === "plan") {
    for (const maxZoom of [12, 13, 14, 15]) {
      const ids = tilesFor(maxZoom);
      const seen = new Set<number>();
      let bytes = 0, missing = 0;
      for (const id of ids) {
        const entry = await source.locate(id);
        if (!entry) { missing += 1; continue; }
        if (!seen.has(entry.offset)) { seen.add(entry.offset); bytes += entry.length; }
      }
      console.log(`maxzoom ${maxZoom}: ${ids.length} tiles (${missing} empty), ${seen.size} distinct, tile data ${(bytes / 1048576).toFixed(1)} MB`);
    }
    console.log(`index reads: ${requests} requests, ${(bytesRead / 1048576).toFixed(1)} MB`);
    return;
  }

  const maxZoom = Number(args.maxzoom ?? 14);
  const out = resolve(args.out ?? resolve(here, `../../../web/public/maps/qatar.pmtiles`));
  const ids = tilesFor(maxZoom);
  const located: Array<{ tileId: number; entry: Entry }> = [];
  for (const id of ids) { const entry = await source.locate(id); if (entry) located.push({ tileId: id, entry }); }

  // Fetch each distinct tile once, merging neighbouring byte ranges (gaps under 256 KB, chunks under 32 MB).
  const distinct = [...new Map(located.map(({ entry }) => [entry.offset, entry])).values()].sort((a, b) => a.offset - b.offset);
  const chunks: Array<{ start: number; end: number; tiles: Entry[] }> = [];
  for (const e of distinct) {
    const last = chunks[chunks.length - 1];
    if (last && e.offset - last.end < 262144 && e.offset + e.length - last.start < 33554432) { last.end = Math.max(last.end, e.offset + e.length); last.tiles.push(e); }
    else chunks.push({ start: e.offset, end: e.offset + e.length, tiles: [e] });
  }
  const data = new Map<number, Uint8Array>();
  let done = 0;
  for (const chunk of chunks) {
    const bytes = await range(url, source.header.tileDataOffset + chunk.start, chunk.end - chunk.start);
    for (const e of chunk.tiles) data.set(e.offset, bytes.slice(e.offset - chunk.start, e.offset - chunk.start + e.length));
    done += 1;
    if (done % 10 === 0 || done === chunks.length) console.log(`  fetched ${done}/${chunks.length} ranges, ${(bytesRead / 1048576).toFixed(1)} MB read`);
  }

  // Tile data in tile-id order (clustered), identical tiles stored once.
  const parts: Uint8Array[] = [];
  const newOffset = new Map<number, number>();
  const entries: Entry[] = [];
  let size = 0;
  for (const { tileId, entry } of located) {
    if (!newOffset.has(entry.offset)) { newOffset.set(entry.offset, size); parts.push(data.get(entry.offset)!); size += entry.length; }
    const offset = newOffset.get(entry.offset)!;
    const previous = entries[entries.length - 1];
    if (previous && previous.offset === offset && previous.tileId + previous.runLength === tileId) previous.runLength += 1;
    else entries.push({ tileId, offset, length: entry.length, runLength: 1 });
  }
  const { root, leaves } = directories(entries);
  const metadata = gzipSync(Buffer.from(JSON.stringify({
    ...source.metadata,
    name: "QLeaves Qatar map",
    description: `Qatar (OSM relation 305095, one-tile margin), zoom 0-${maxZoom}, from Protomaps build ${build}`,
    attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
    qleaves_source: { build: url, extracted: new Date().toISOString(), boundary: "OpenStreetMap relation 305095 (polygons.openstreetmap.fr)", maxzoom: maxZoom },
  })));

  const header = Buffer.alloc(127);
  header.write("PMTiles", 0, "ascii"); header.writeUInt8(3, 7);
  const rootOffset = 127, metadataOffset = rootOffset + root.length, leafOffset = metadataOffset + metadata.length, tileOffset = leafOffset + leaves.length;
  u64(header, 8, rootOffset); u64(header, 16, root.length); u64(header, 24, metadataOffset); u64(header, 32, metadata.length);
  u64(header, 40, leafOffset); u64(header, 48, leaves.length); u64(header, 56, tileOffset); u64(header, 64, size);
  u64(header, 72, located.length); u64(header, 80, entries.length); u64(header, 88, newOffset.size);
  header.writeUInt8(1, 96); header.writeUInt8(2, 97); header.writeUInt8(source.header.tileCompression, 98); header.writeUInt8(source.header.tileType, 99);
  header.writeUInt8(0, 100); header.writeUInt8(maxZoom, 101);
  header.writeInt32LE(Math.round(bbox.west * 1e7), 102); header.writeInt32LE(Math.round(bbox.south * 1e7), 106);
  header.writeInt32LE(Math.round(bbox.east * 1e7), 110); header.writeInt32LE(Math.round(bbox.north * 1e7), 114);
  header.writeUInt8(10, 118); header.writeInt32LE(Math.round(51.53 * 1e7), 119); header.writeInt32LE(Math.round(25.29 * 1e7), 123);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.concat([header, root, metadata, leaves, ...parts]));
  const total = 127 + root.length + metadata.length + leaves.length + size;
  console.log(`wrote ${out}: ${(total / 1048576).toFixed(2)} MB, ${located.length} tiles, ${newOffset.size} distinct, zoom 0-${maxZoom}`);
  console.log(`source reads: ${requests} requests, ${(bytesRead / 1048576).toFixed(1)} MB`);
  const [z, x, y] = tileIdToZxy(entries[entries.length - 1].tileId);
  console.log(`last tile z${z}/${x}/${y}`);
}

main().catch((error) => { console.error("FAILED", error); process.exit(1); });
