# Qatar delivery map

Checkout asks customers to confirm their delivery location on a map of Qatar; the confirmed point is saved with
the order and shown in admin. Everything runs on the existing free hosting (Vercel), with no map or geocoding
accounts and no per-request costs.

## How it fits together

| Part | Where | What |
| --- | --- | --- |
| Map data | `apps/web/public/maps/qatar.pmtiles` (served by Vercel's CDN at `/maps/qatar.pmtiles`) | One PMTiles archive of Qatar. The browser reads only the parts it needs with HTTP range requests (206). |
| Map fonts | `apps/web/public/maps/fonts/` | Noto Sans glyph files for Latin and Arabic labels, so nothing loads from third-party servers. |
| Rendering | MapLibre GL JS 6 in the browser (`apps/web/src/features/map/`) | Custom QLeaves dark style built on `@protomaps/basemaps`. Loaded only by checkout and admin. |
| Address search and "nearest address" | QLeaves API, `POST /api/v1/geo/search` and `POST /api/v1/geo/reverse` | Answered from `apps/api/src/lib/geo/qatar-places.json`, built from the same map file. POST keeps addresses and coordinates out of URLs and logs. |
| "Is it in Qatar?" | `apps/api/src/lib/geo/qatar-boundary.json` | Point-in-polygon check on the server for every order location. |
| Order location | `OrderDeliveryLocation` table (migration `5_order_delivery_location`) | Saved in the same transaction as the order; only the admin order screens read it. |

## What the pin fills in

Tapping the map (or choosing a search result, or using the current location) places the pin. From the pin the site
fills in the street, a nearby landmark, the checkout address line and the delivery area (from the municipality the
pin is in: `apps/api/src/lib/geo/qatar-municipalities.json`, OpenStreetMap admin_level 4 boundaries, rebuilt with
`scripts/maps/build-qatar-municipalities.ts`). Anything the customer types themselves is never overwritten. Zone and
building numbers are not in OpenStreetMap, so the customer reads them off their blue plate; those fields stay empty
and are marked "Please add".

Delivery is Qatar-wide. A confirmed pin anywhere inside the Qatar boundary is accepted, in all eight municipalities,
with no zones, radius or distance pricing. The order's area is set on the server from the municipality the pin is in.
Moving the pin to a different neighbourhood refreshes area, street and landmark, clears zone, building and flat typed
for the old spot, and asks for confirmation again. Admin shows country, municipality, every address detail, the
coordinates and the map, and marks each of area, street and landmark as "from the map" or "typed by customer".

On phones: a tap places or moves the pin, a one-finger swipe moves the map, a pinch zooms.

## Data, source and licence

- **Map data**: OpenStreetMap contributors, © OpenStreetMap contributors, licensed under the Open Database
  Licence (ODbL). Attribution is always visible on the map. Tiles use the Protomaps basemap schema.
- **Built from**: Protomaps daily build `https://build.protomaps.com/20261113.pmtiles` (OpenStreetMap data of
  13 November 2026), extracted on 13 November 2026.
- **Boundary**: OpenStreetMap relation 305095 (Qatar, including islands and territorial waters), from
  polygons.openstreetmap.fr. A one-tile margin is kept around it so the coast is never clipped. The same boundary
  is used to check order locations.
- **Measured size**: 28.87 MB (zoom 0-15, 28,764 tiles of which 13,445 unique). Layers: boundaries, buildings,
  earth, landcover, landuse, places, pois, roads, water. Zoom 15 is the source's full detail; the map can zoom
  further (to 18) by enlarging zoom-15 tiles.
- **Place index**: 4.89 MB; 231 areas, 9,111 landmarks, 13,676 named street stretches (English and Arabic names
  where OpenStreetMap has them).

## Refreshing the map (any time, a few minutes)

```bash
cd apps/api
npx tsx scripts/maps/extract-qatar-map.ts plan --build=YYYYMMDD        # sizes per zoom, downloads no tiles
npx tsx scripts/maps/extract-qatar-map.ts build --build=YYYYMMDD --maxzoom=15
npx tsx scripts/maps/inspect-qatar-map.ts                              # checks tiles across Qatar
npx tsx scripts/maps/build-qatar-places.ts                             # rebuilds the search index
npx tsx scripts/maps/try-geo.ts                                        # sample searches and lookups
```

`YYYYMMDD` is a recent Protomaps build (list: `https://build-metadata.protomaps.dev/builds.json`). Fonts only
need fetching again if new scripts are added: `npx tsx scripts/maps/fetch-map-fonts.ts`.

## Known limits (from the data, not hidden)

- OpenStreetMap has few house numbers in Qatar and no blue-plate (zone / street / building) numbers, so search
  finds areas, streets and landmarks, and customers add zone, street, building and flat in the form.
- Results say how exact they are (device location, named place, street, area only, pin placed by hand); an area
  result asks the customer to place the pin on their building.
- Building outlines exist where mappers drew them: dense in Doha, Al Rayyan, the Pearl and Al Wakrah; sparse in
  parts of Umm Salal, Al Daayen and rural areas.
- Arabic names cover most streets and places; a few places have only an English or only an Arabic name.

## Costs

Nothing beyond the existing hosting: the map file and fonts are static files on Vercel (about 0.5-1 MB of map data
per checkout session in testing), and search runs inside the existing API function.
