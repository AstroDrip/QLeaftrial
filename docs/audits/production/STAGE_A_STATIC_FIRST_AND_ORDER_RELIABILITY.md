# Stage A: static-first storefront and order reliability (audit and plan)

Written 2026-11-16. Audit and plan only: no application code was changed for this document. Implementation starts
only after the owner approves it.

Local state at the time of writing: `main` is 3 commits ahead of the live site (money and security fixes,
simultaneous-request guards, order emails). PostgreSQL migration 6 has been applied to production by the owner.
Those commits are not pushed.

"Measured" below means measured on 2026-11-16. Everything else is read from the code or is a stated estimate.

## 1. Current architecture and deployment

| Part | Finding |
|---|---|
| Frontend | React 19 + Vite 7, built to `apps/web/dist`, served by Vercel's CDN. It is already an independent static artifact: no server renders the homepage |
| API | Express 5 as one Vercel function (`api/index.ts`), region `bom1`, 30 s limit, no process that stays alive between requests |
| Database | Supabase PostgreSQL (Mumbai); SQLite locally and in tests |
| Images | Supabase Storage (signed direct uploads) plus older static images in the repo |
| Map | Static PMTiles file and fonts on the CDN, with Range requests; place search in the API from local files |
| Scheduled work | One daily Vercel job added in the unpushed work; nothing else |
| Fonts | Loaded from Google Fonts at page load, not from the static build |

Measured build (`apps/web/dist`): 50.6 MB in 381 files. Map 32.8 MB, product and hero media 15.0 MB, code 2.5 MB.
Hero image 70 kB (desktop) and 24 to 45 kB (phone). Main script 108 kB (37 kB gzip), vendor 329 kB (105 kB gzip).

Measured live catalogue (`/api/v1/catalogue`): 188 kB, 29 kB gzip. First request 2.2 s (CDN miss), then 0.25 to
0.47 s (CDN hit). The build-time copy `/catalogue/catalogue.json` exists on the live site and is the same size.

## 2. What already works (kept)

- Hero, progressive blur (`.home-stage__blur`, three layers, Safari prefix), category rail, shelves, header and
  animations are all in the static bundle and CSS. None waits for the API to appear.
- Catalogue: CDN-cached API, build-time snapshot, last copy in `localStorage`, newer-wins check, JSON shape check.
- Orders: one transaction for order, items, stock and location; unique `idempotencyKey`; rate limit; server-side
  prices; Qatar boundary and confirmation-age checks.
- In the unpushed work: customer-safe order response, audit trail, notification outbox written in the order
  transaction, Resend delivery with retries, admin status and resend.
- Qatar-wide map with autofill, stale-response guard and source tags in admin.
- Google Sheets mirror of completed and paid orders, with per-order retry and "sync all".

## 3. Bugs, risks and gaps found

### Storefront

| # | Finding | Evidence |
|---|---|---|
| S1 | A first-time visitor has no product data until a network request returns. `useCatalogue` only has instant data when this browser saved a catalogue before | `catalogue-client.ts` `initialData` |
| S2 | The live API is tried first with a 12 s timeout; the static copy is only tried after that fails. A slow API means up to 12 s of empty shelves | `fetchCatalogue` |
| S3 | The homepage also calls `/products` and `/products/filters` directly; New Arrivals shows a loading state until `/products` answers when nothing is saved | `HomePage.tsx` lines 90 to 97, 166 |
| S4 | The build carries on without a catalogue snapshot if the database is unreachable at build time | `generate-catalogue.ts` catch block |
| S5 | Fonts come from Google's servers. If they are slow, text falls back; the look depends on a third party | `index.html` |
| S6 | New Arrivals is "newest published" minus Garden Accessories, not a curated list | `HomePage.tsx` |

### Orders

| # | Finding | Evidence |
|---|---|---|
| O1 | The idempotency key lives in a React ref. A page refresh during or after submission loses it, and the retry is a new order | `CheckoutPage.tsx` line 62 |
| O2 | Nothing about a submission is stored on the device. A refresh, crash or closed tab loses the whole attempt | no IndexedDB use anywhere in `apps/web/src` |
| O3 | The key is optional. A request without the header creates an order with no duplicate protection | `order.routes.ts` |
| O4 | If the idempotency column is missing, the API silently creates orders without it | `missingIdempotencyColumn` in `order.service.ts` |
| O5 | I added the same kind of fallback on 2026-11-15 for a missing notification table. By this brief's rule it is wrong and will be removed | `missingNotificationTable` |
| O6 | The same key with a different payload returns the first order instead of a conflict; no payload fingerprint is stored | `createOrder` |
| O7 | The order response waits for the email send (up to 5 s) and the Google Sheet write (up to 6 s) | `order.routes.ts` |
| O8 | Stock rows are updated in request order, not a fixed order; two orders with the same products in opposite order can deadlock on PostgreSQL | `insertOrder` |
| O9 | A changed price is applied silently: the customer sees the new total only on the confirmation page | `insertOrder` uses current prices and no expected total is sent |
| O10 | The readiness check only counts products; it does not check that required columns and tables exist | `app.ts` `/ready` |
| O11 | Deploys do not fail when a migration is pending | `vercel-build` |
| O12 | Customers can be shown "Reference: <request id>" on a server error | `apps/web/src/lib/api-error.ts` |
| O13 | All transaction and concurrency tests run on SQLite, which runs writes one at a time and cannot show PostgreSQL races | `apps/api/tests` |

### Security and operations

| # | Finding | Evidence |
|---|---|---|
| X1 | Admin actions rely on the `SameSite=Lax` cookie alone. There is no Origin check on state-changing requests | no Origin handling in `apps/api/src` |
| X2 | The Content Security Policy is report-only | live response header |
| X3 | Backups: not verified. I cannot see the Supabase plan from here | `docs/deployment/production-hardening.md` |
| X4 | 7 dependency advisories remain (Prisma tooling, Vitest); fixing them needs breaking upgrades | `npm audit` on 2026-11-15 |
| X5 | Admin order and product lists are unbounded | `listOrders`, `listAdminProducts` |

## 4. Hosting: Vercel now, Render considered

Recommendation: **stay on Vercel for this work.** Do not split hosts in the same change as the reliability work.

Reasons, from the code:

- The frontend is already a static artifact on a CDN. Moving it to Render does not make the homepage more
  independent; the fixes in section 5 do.
- Today the site and API share one origin. Splitting them needs CORS, a cross-site admin cookie
  (`SameSite=None; Secure`, which weakens X1 further), a new CSP `connect-src`, and new rewrites for
  `/api/v1/*`, `/sitemap.xml` and the image redirects in `vercel.json`.
- The map file needs HTTP Range support and long caching on the static host. That works on Vercel today and would
  have to be proven on Render before any switch.
- The database is in Mumbai and the function runs in Mumbai. Render's region list must be checked for a nearby
  region; a far region adds a round trip to every query.
- A Render web service that stays running would let the outbox worker run in-process and removes cold starts. That
  is a real benefit. It is also a paid service, and the owner asked on 2026-11-13 for everything to be free.

What I will do instead so the choice stays open: keep the code host-neutral. The worker is one function that can
be called by a scheduler (Vercel) or run in a loop (a long-running server). No Vercel configuration is removed and
no second deployment system is added. If Render is approved later, the migration is: prove Range and caching on a
Render preview, add CORS and cookie settings behind environment variables, run both in parallel on a test domain,
switch DNS, keep Vercel for one week as rollback.

Not verified: Render's current prices and regions. They must be read from Render's own pages before a decision.

## 5. Recommended architecture and data flows

### 5.1 First visit (no API needed)

1. The build writes a compact homepage bootstrap: categories in the shop's order with counts, the Featured shelf,
   the first row of New Arrivals (names in English and Arabic, prices, catalogue image URLs, sizes), and a version.
2. The bootstrap is embedded in `index.html` as a JSON data block, so it arrives with the page: no extra request
   and nothing to wait for. A JSON data block is not executed, so the script policy is unaffected.
3. The homepage renders from the bootstrap at once, then from the stored catalogue if this browser has one, then
   from the fresh catalogue when it arrives. Whichever has the newer version wins; an older one never replaces a
   newer one.
4. If the database is unreachable at build time, the build uses the last committed bootstrap file and prints a
   clear warning. If there is no valid bootstrap at all, the build fails. A release can no longer ship without one.
5. Fonts are served from the static build instead of Google.

### 5.2 Catalogue refresh (one system, not several)

- **Source of truth for browsing:** `/api/v1/catalogue`, cached at the CDN for a minute and served stale for a day.
  Admin edits appear within about a minute without a redeploy. This already exists and is kept.
- **Floor:** the build-time `/catalogue/catalogue.json`.
- **Change:** the browser fetches the static copy and the live copy together instead of one after the other, with
  a 4 s limit on the live one, accepts the newest valid one, and stores it. The larger store moves to IndexedDB;
  `localStorage` keeps only a small pointer for compatibility.
- I am not adding a third copy in Supabase Storage: the CDN-cached API already gives edits without redeploy.
- Cached data never decides stock, price, publication or totals. Checkout re-reads all of them on the server.

### 5.3 Order submission

```
Customer presses "Place order"
  -> build the normalized payload and its fingerprint
  -> save { key, payload, fingerprint, state: pending_submission } in IndexedDB   (before any network call)
  -> POST /orders with Idempotency-Key
       201/200  -> state accepted -> show confirmation, clear cart, delete the saved record
       4xx      -> state rejected -> show the field message, keep the cart
       timeout / dropped / 5xx / offline
                -> state outcome_unknown -> "We're confirming your order…"
                -> retry the SAME key and payload with growing, jittered delays
                -> after the automatic retries: "Saved on this device, not yet received" with Try again and
                   the shop's contact
On any later page load: an unfinished record is found and resumed with its original key.
```

Server:

- The key is required (400 without it). The fingerprint is stored with the order.
- Same key, same fingerprint: the original order is returned. Same key, different fingerprint: 409, nothing created.
- The missing-column and missing-table fallbacks are removed. The readiness check and the deploy check verify the
  schema; a missing piece fails the deploy and makes `/ready` answer 503.
- Stock rows are updated in product-id order. A PostgreSQL deadlock or serialization failure is retried once
  inside the same key, so it cannot create a second order.
- The payload carries the total the customer saw. If the server's total differs, the answer is 409
  `PRICE_CHANGED` with the current prices; the checkout shows what changed and asks the customer to confirm.
- The response is sent as soon as the transaction commits. Email and Sheets are not waited for.

### 5.4 Outbox and worker

- The existing `NotificationOutbox` table becomes the single outbox for email and Sheets events. It gains a lease
  expiry column and accepts a `SHEET_SYNC` event type. One table, not two systems.
- Events are written in the same transaction as the order or the order change.
- The worker claims a row by setting its lease in one conditional update, does the work, then records completion.
  An expired lease means the previous worker died, and the row is taken again. Delivery is at-least-once; Resend
  gets the same idempotency key each time and a Sheets write is keyed by order number, so a repeat is harmless.
- A Sheets event carries no data: when processed it mirrors the order's current state, so late, repeated or
  out-of-order events all end in the right row.
- After the response is sent, Vercel's `waitUntil` gives the worker a head start on that order's events. This only
  speeds things up; it is not what makes delivery reliable.
- Scheduling on Vercel: the daily Vercel job, plus a one-minute trigger from Supabase's `pg_cron` calling the
  worker endpoint with the secret. Both are free as far as I know; I will confirm that `pg_cron` and `pg_net` are
  available on this project before relying on them. Fallback: a GitHub Actions schedule.

## 6. Database migrations

| Migration | Contents | Status |
|---|---|---|
| PG 6 | `AdminAuditLog`, `NotificationOutbox`, `Order.deliveryFeeConfirmedBy` | Applied to production by the owner; code not pushed |
| PG 7 | `Order.requestFingerprint` (optional text); outbox `leaseExpiresAt`, `completedAt` | New, additive |
| PG 8 | `Payment`, `PaymentWebhookEvent`, `CARD` method | Later, with the payment phase |
| PG 9 | `Product.newArrival`, media thumbnail fields, admin list indexes | Later |

Each is additive, mirrored in the SQLite schema, applied by the owner before the code that needs it is pushed.
Once PG 7 is live, a deploy with a pending migration fails instead of running half-protected.

## 7. Cost

| Item | Cost |
|---|---|
| Staying on Vercel and Supabase free plans | none |
| Resend free plan | none within its daily and monthly limits |
| `pg_cron` trigger or GitHub Actions schedule | none, to be confirmed |
| Render paid web service | paid; price to be read from Render |
| Card payments | provider fees; not free with any provider |
| Supabase automated backups or point-in-time recovery | to be checked in the owner's dashboard; may need a paid plan |

## 8. Phases, in the brief's order

| Phase | Work | Main files |
|---|---|---|
| 1 | Hosting decision recorded; no routing change | this document |
| 2 | Homepage bootstrap generated at build and embedded; homepage renders from it; build fails without one | `apps/api/scripts/generate-catalogue.ts`, `apps/api/src/lib/catalogue.ts`, `apps/web/vite.config.ts`, `apps/web/index.html`, `HomePage.tsx`, `package.json` |
| 3 | Fonts self-hosted; test that hero, blur and rail appear with the API blocked | `apps/web/public/fonts`, `index.html`, `global.css`, `vercel.json` (CSP) |
| 4 | Parallel static and live catalogue, newest wins, IndexedDB store | `catalogue-client.ts`, new `catalogue-store.ts` |
| 5 | Pending-order store, state machine, recovery on load, the five customer states in English and Arabic, no technical text shown | new `checkout/pending-order.ts`, `checkout/submit-order.ts`, `CheckoutPage.tsx`, `OrderConfirmationPage.tsx`, `lib/api-error.ts`, `locales.ts`, `checkout.css` |
| 6 | Key required, fingerprint, conflict answer, fallbacks removed, readiness and deploy checks (PG 7) | `order.routes.ts`, `order.service.ts`, `order.schemas.ts`, `app.ts`, `check-production-schema.mjs`, both schemas |
| 7 to 9 | Outbox events in the transaction, response right after commit, lease-based worker, scheduler | `notifications/outbox.ts`, `notification.routes.ts`, `order.routes.ts`, `api/index.ts`, `vercel.json` |
| 10 | Order email delivered by the worker (the existing email code, moved off the request) | `notifications/*` |
| 11 | Sheets through the outbox; policy unchanged; "sync all" kept | `sheets/order-sheet.ts`, `sheets.routes.ts`, `order.routes.ts` |
| 12 | Payments: models, adapter, webhooks, test simulator; real provider when the owner has one | new `payments/*` (PG 8) |
| 13 | Map: typed-address parsing, "unavailable" marking in admin | `LocationPicker.tsx`, `OrderLocation.tsx`, `lib/geo/qatar.ts` |
| 14 | 500+ products: thumbnail variant, `srcset`, placeholders, upload cleanup, photo folder review | `admin/product-upload.service.ts`, `ProductCard.tsx`, product pages (PG 9) |
| 15 | Admin pagination, filters, aggregates | `admin-product.service.ts`, `order.service.ts`, admin pages |
| 16 | Origin check, CSP review, log review, backup and restore drill | `app.ts`, `vercel.json`, `docs/deployment` |
| 17 to 18 | Full Vitest, PostgreSQL, Playwright and build runs; performance and failure-injection reports | `apps/web/e2e/*`, `apps/api/tests/pg/*` |

One commit per phase. Phases with a migration wait for the owner to apply it. Nothing is pushed without a yes.

## 9. Tests and acceptance

- **PostgreSQL:** a real PostgreSQL server for transaction, concurrency and idempotency tests. Proposed: the
  `embedded-postgres` npm package as a development dependency, which runs a real PostgreSQL locally with no
  account. Alternative: a second free Supabase project used only for tests. Production is never used.
- **Playwright:** desktop Chromium and a phone profile; the storefront tests and the twenty order-recovery cases in
  the brief, using request interception to delay, drop or fail responses, and killing the local API mid-request
  for the "committed, then process dies" case. Emails are off in these runs.
- **Acceptance tests from the UX addendum:** a committed order whose response is dropped shows "We're confirming
  your order…" and then the original order number, with one order in the database; a fully unavailable backend
  shows the calm "saved on this device, reconnecting" state and never a confirmation.
- **Layout:** the project's overlap audit at 320 to 1440 px in English and Arabic for every changed screen.

## 10. Risks and rollback

| Risk | Mitigation |
|---|---|
| A stale bootstrap shows an old price for a moment | It is replaced by fresh data within the same visit; checkout always uses server prices and now asks on a change |
| IndexedDB blocked (private mode, old browsers) | Fall back to memory for this tab and say plainly that the order is not saved on the device |
| Requiring the key rejects an old cached copy of the site | The current site already sends the key on every order, so old tabs keep working |
| Moving email off the request delays it if the head start is cut short | The one-minute scheduler picks it up; the admin page still shows status and resend |
| Embedded PostgreSQL download blocked on this PC | Use the separate test Supabase project instead |
| Rollback | Each phase is one commit and reverts cleanly; migrations are additive, so older code runs on the newer database |

## 11. Needed from the owner

- A decision on the points in section 12.
- Vercel variables for email: `EMAIL_PROVIDER_API_KEY` (the replacement key), `ORDER_NOTIFICATION_EMAIL`, `CRON_SECRET`.
- Migration PG 7 applied before phase 6 is pushed.
- Enabling `pg_cron` and `pg_net` in the Supabase dashboard, if that scheduler is chosen.
- The Supabase plan's backup page checked, and a first export and restore drill run together.
- A support phone or WhatsApp number to show customers when an order cannot be sent (store settings has a field).
- Payment provider and sandbox credentials, when available.

## 12. Decisions

1. **Push the three finished commits first?** Recommended: yes. Migration 6 is already applied, and this work
   builds on them.
2. **Hosting:** stay on Vercel (recommended), or plan the Render split.
3. **PostgreSQL for tests:** `embedded-postgres` (recommended) or a second free Supabase project.
4. **Scheduler:** Supabase `pg_cron` every minute (recommended) or GitHub Actions.
5. **Floating cart when empty:** this brief again asks for a compact indicator while the cart is empty. On
   2026-11-15 the owner chose the opposite (nothing when empty). Unless told otherwise, the 2026-11-15 choice stands.
6. **Hero release point:** this brief says the stage releases after the category section; the earlier brief said
   at New Arrivals. The current behaviour will be measured and shown before anything is changed.
7. **Photo folder:** `C:\Users\HP\Desktop\plannts` holds 122 files (103 indoor, 11 tabletop, 8 bougainvillea). The
   local database already has 123 products, 9 of them bougainvillea, so most appear to be imported already. I
   will compare by file content before proposing any import; nothing is imported or deleted without a list first.

## 13. How this relates to the plan approved on 2026-11-15

That plan's stages 1 to 3 are done. Its remaining stages map onto phases 12 to 18 here. This document's phases 2
to 11 are new work that now comes first. One change of design: on 2026-11-15 the email was sent inside the order
request with a 5 second limit; under this brief it moves to the worker, and the request returns right after commit.
