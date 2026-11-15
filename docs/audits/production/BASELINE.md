# QLeaves production baseline

Measured 2026-11-15 at commit `5c84c9b` (main, pushed and live), before any work on the master production brief.
"Measured" means run on this machine today. "Not measured" means it needs production access that was not used.

## Architecture as deployed

| Part | What it is |
|---|---|
| Storefront | React 19 + Vite 7 single-page app (`apps/web`), served statically by Vercel |
| API | Express 5 (`apps/api`), one Vercel function `api/index.ts`, region `bom1`, 30 s limit |
| Database | Supabase PostgreSQL (Mumbai) in production; SQLite for development and tests |
| ORM | Prisma 6.16.2, two schemas kept in step (`prisma/schema.prisma`, `prisma/postgresql/schema.prisma`) |
| Images | Supabase Storage, direct signed uploads; older catalogue images are static files in the repo |
| Map | MapLibre GL 6.16.0 + one PMTiles file + local Qatar place index; no external map or geocoding service |
| Sheets | Optional Google Sheets mirror of completed and paid orders |
| Scheduled jobs | None (`vercel.json` has no `crons`) |

Database models (same names in both schemas): AdminUser, StoreSettings, Session, Product, ProductMedia, Inventory,
Order, OrderDeliveryLocation, OrderItem, Review, RateLimitBucket. There is no Payment, notification or audit model.

Migrations: 16 SQLite, 6 PostgreSQL (`0_init` to `5_order_delivery_location`), all applied in production.

## Feature to endpoint to model

| Feature | Endpoint | Models |
|---|---|---|
| Catalogue, search, filters | `GET /products`, `/products/:slug`, `/products/filters`, `/catalogue` | Product, ProductMedia, Inventory |
| Checkout | `POST /orders` (rate limit, idempotency key) | Order, OrderItem, OrderDeliveryLocation, Inventory |
| Map search and pin | `POST /geo/search`, `/geo/reverse` | none (local index files) |
| Invoice | `GET /invoices/:id` (signed link) | Order |
| Reviews | `GET /reviews`, admin CRUD | Review |
| Admin login | `POST /auth/login`, `/auth/logout`, `GET /auth/session` | AdminUser, Session |
| Admin orders | `GET /admin/orders`, `PATCH /admin/orders/:id…`, delete, bulk delete | Order |
| Admin dashboard and sales | `GET /admin/dashboard`, `/admin/sales` | Order, Inventory |
| Admin products and uploads | `GET/POST/PUT/PATCH/DELETE /admin/products`, `POST /admin/product-uploads` | Product, ProductMedia |
| Store settings | `GET /storefront/settings`, `GET/PUT /admin/storefront-settings` | StoreSettings |
| Google Sheets | `GET /admin/sheets/status`, `POST /admin/sheets/sync[/:orderId]` | Order |

## Tests and build

| Check | Result |
|---|---|
| API tests (Vitest) | 220 passed, 31 files |
| Web tests (Vitest) | 233 passed, 46 files (one unexplained single failure on 2026-11-14, passed on three reruns) |
| Playwright | 1 spec, 17 lines (`apps/web/e2e/mobile-overflow.spec.ts`) |
| Typecheck | passes |
| Production build | passes |

Largest build outputs:

| File | Size | Gzip |
|---|---|---|
| maplibre-gl-worker (checkout and admin only) | 519 kB | not reported |
| vendor js | 329 kB | 105 kB |
| index js | 108 kB | 37 kB |
| maplibre css | 72 kB | 10 kB |
| index css | 62 kB | 13 kB |
| QatarMap js | 44 kB | 10 kB |
| admin css | 34 kB | 6 kB |

## Repository

| Measure | Value |
|---|---|
| Tracked files | 664 |
| Git pack size | 48.27 MiB |
| Tracked images | 313 |
| Largest file | `apps/web/public/maps/qatar.pmtiles`, 28.87 MB |
| Address index | `qatar-places.json` 4.89 MB, `qatar-municipalities.json` 0.54 MB |
| Largest images | bougainvillea detail images, 0.30 to 0.40 MB each |

## Dependency advisories (`npm audit`)

15 advisories in total: 5 critical, 8 high, 2 moderate. Among production packages: `proxy-addr` (critical, IP
spoofing), `body-parser`, `compression`, `qs` (high) are fixable without breaking changes; `deepmerge-ts` and
`effect` (Prisma tooling) need a forced upgrade and will be assessed separately.

## Confirmed defects found during this baseline

| # | Defect | Where |
|---|---|---|
| 1 | A declined (cancelled) order can be marked paid | `updatePaymentStatus` has no status check |
| 2 | Any database error while changing payment status is reported as "order not found" (404) | `updatePaymentStatus` catch-all |
| 3 | A delivery charge that was already confirmed can be changed again with no record, including on completed and paid orders | `confirmDeliveryFee` |
| 4 | Sales report and dashboard count only merchandise subtotal; delivery charges and final totals are not reported | `salesReport`, `dashboardStats` |
| 5 | `POST /orders` returns the raw database row to the customer (idempotency key, sheet-sync fields, internal ids) | `order.routes.ts` |
| 6 | No record of which admin changed a status, payment or delivery charge | whole admin order module |
| 7 | Admin orders and admin products endpoints return every row with every image | `listOrders`, `listAdminProducts` |
| 8 | No scheduled worker exists, so nothing can retry a failed side effect | `vercel.json` |

## Not measured

Production database and table sizes, query plans on production, Supabase Storage usage, Vercel bandwidth, and
real-device LCP/CLS/INP. These need production access or are measured in the performance stage.
