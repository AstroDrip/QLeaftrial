import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

// Loads MapLibre and the PMTiles reader only when a map is actually shown (checkout location step, admin order
// location), never on other pages. The PMTiles protocol is registered once and shared by every map.
type MapModules = { maplibre: typeof import("maplibre-gl"); };

let loading: Promise<MapModules> | null = null;

export function loadMap(): Promise<MapModules> {
  loading ??= (async () => {
    const [maplibre, { Protocol }] = await Promise.all([
      import("maplibre-gl"),
      import("pmtiles"),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ]);
    // MapLibre builds its worker's address at runtime, which bundlers cannot see; point it at the copied file.
    maplibre.setWorkerUrl(workerUrl);
    const protocol = new Protocol({ metadata: true });
    maplibre.addProtocol("pmtiles", protocol.tile);
    return { maplibre };
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
