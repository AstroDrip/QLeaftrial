# QLeaves production plan (awaiting approval)

Written 2026-11-15 against commit `5c84c9b`. No application code has been changed. Baseline figures are in
`BASELINE.md`. Nothing here is built until the plan is approved.

## 1. What exists, what is missing

| Area | Exists today | Missing |
|---|---|---|
| Orders | Atomic order creation, idempotency key, stock reservation, status transitions, rate limit | Payment-status rules, delivery-charge lock, admin attribution, safe public response |
| Email | Nothing | Everything: provider, outbox, worker, templates, admin view |
| Map and address | Local Qatar map, search, reverse lookup, Qatar-wide delivery, autofill of area, street, landmark, municipality, stale-response guard, admin card with source tags | Zone and building detection, typed-address parsing, "missing" marking and copy-coordinates in admin |
| Catalogue | Product, ProductMedia (ordered, main image, alt text), two image sizes, signed direct upload, multilingual search with aliases | Thumbnail size, admin pagination, bulk actions, curated New Arrivals flag, cleanup of abandoned uploads |
| Admin | Orders, products, reviews, settings, sheets status | Pagination, filters, audit trail, notification and payment status |
| Payments | COD and manual payment link only | Payment model, provider adapter, webhooks, card checkout |
| Google Sheets | Mirror of completed and paid orders, per-order retry | Automatic retry, reconciliation report |
| Tests | 453 unit and integration tests; one 17-line Playwright spec | The full Playwright suite |
| Scheduled work | None | A worker for retries |

## 2. Confirmed bugs (all reproduced by reading the code; tests will be written first)

1. Declined order can be marked paid.
2. Database failure during a payment-status change is reported as 404.
3. Confirmed delivery charge can be silently changed, even on completed and paid orders.
4. Sales report and dashboard ignore delivery charges and final totals.
5. `POST /orders` returns internal fields to the customer.
6. Admin changes to money and status are not attributed to an admin.
7. Admin order and product lists are unbounded.
8. Production dependency advisories: `proxy-addr` (critical), `body-parser`, `compression`, `qs` (high).

## 3. Potential bugs to verify during stage 1 and 2

- Two admins changing the same order at once (no version check).
- Delivery-charge confirmation is not inside a transaction.
- Sheet mirror is awaited inside the order request, so a slow Google call slows checkout.
- Order edit after a delivery charge was confirmed.
- Session expiry behaviour during a long admin edit.
- One web test failed once and passed on rerun; it will be identified.

## 4. Dead code

The checkout dead-code report (`docs/audits/checkout/DEAD_CODE_AND_TECH_DEBT.md`) covers checkout only. Stage 1
repeats the import-graph analysis for the whole repository and writes `DEAD_CODE_REPORT.md` with classes A to E.
Only class A is removed. Migrations and operational scripts are kept.

## 5. Stages (in the order the brief sets)

Each stage ends with unit tests, typecheck, relevant Playwright tests, production build and a local commit. Nothing
is pushed without your say-so, and any stage with a database migration waits for you to apply it first.

| # | Stage | Main changes | Migration |
|---|---|---|---|
| 1 | Security and money integrity | Fix bugs 1 to 6 and 8; public order view; `AdminAuditLog`; sales report split into merchandise, delivery, total | PG 6 |
| 2 | Order-state and stock concurrency | Transactions around charge and payment changes; concurrency tests on both databases | none |
| 3 | Order emails | Resend client, `NotificationOutbox`, worker endpoint, HTML email (EN and AR safe), admin status and retry | PG 6 |
| 4 | Address enrichment | Typed Qatar address parser; use OSM house-number data where it exists; "missing" marks and copy-coordinates in admin; optional provider slot left off | none |
| 5 | Payment models and adapter | `Payment`, `PaymentWebhookEvent`, provider interface, CARD payment method | PG 7 |
| 6 | Payment sandbox and webhooks | Signed webhook endpoint, idempotent processing, amount and currency checks, expiry, refund records, local simulator for tests only | none |
| 7 | Product media | 320 px thumbnail, dimension checks, duplicate detection, cleanup of abandoned and orphaned files, media manager improvements | PG 8 |
| 8 | Admin pagination and bulk actions | Paged, filtered, sorted product list with thumbnails only; transactional bulk actions | PG 8 (indexes) |
| 9 | Admin orders and notifications | Paged, filtered order list; notification and payment status on each order | none |
| 10 | Google Sheets | Retry through the same worker, duplicate-row guard, reconciliation view; accounting rule unchanged | none |
| 11 | Floating cart | Depends on decision D4 below | none |
| 12 | Homepage stage | Measure the stage height so the hero releases at New Arrivals, phone and desktop | none |
| 13 | Hero depth | Only if it measures well on phones; real photography kept | none |
| 14 | New Arrivals | Admin-controlled flag on products; Garden Accessories excluded unless selected | PG 8 |
| 15 | Playwright suite | `apps/web/e2e/`: customer, notification, 500-product, payment, admin, visual and failure-injection tests on a dedicated test database | none |
| 16 | Performance | `PERFORMANCE_BASELINE.md`, optimisations, `PERFORMANCE_AFTER.md`, projections | none |
| 17 | Documents and readiness review | The eleven documents in the brief, with status labels | none |

## 6. Database changes (both schemas, always together)

- **PG 6:** `NotificationOutbox` (order, event type, recipient, status, attempts, last and next attempt, last error
  code, sent time; unique on order + event type), `AdminAuditLog` (admin, action, order or product, before and
  after values), `Order.deliveryFeeConfirmedBy`.
- **PG 7:** `Payment` (order, provider, provider transaction id, merchant reference, amount, currency QAR, status,
  checkout URL, expiry, verified time, refund status), `PaymentWebhookEvent` (unique provider event id), `CARD`
  added to the payment method enum.
- **PG 8:** `ProductMedia` thumbnail fields and content hash, `Product.newArrival`, indexes for admin lists.

All are additive: new tables and nullable columns only. No column is dropped and no data is rewritten.

## 7. API changes

- New: `POST /internal/worker` (secret-protected, processes outbox and sheet retries), `GET /admin/notifications`,
  `POST /admin/notifications/:id/retry`, `POST /orders/:id/payments`, `POST /payments/webhook/:provider`,
  `GET /admin/audit`, bulk product endpoint.
- Changed: `GET /admin/orders` and `GET /admin/products` become paged (`items`, `total`, `page`, `filters`);
  `POST /orders` returns a public view; `/admin/sales` gains delivery and total figures (existing fields kept).
- The admin pages are updated in the same commit as each endpoint, so nothing breaks in between.

## 8. Email design (stage 3)

1. The order transaction also writes the outbox row, so an order can never exist without its notification record.
2. After commit, the request sends the email itself and waits for the answer, with a 5 second limit. No unawaited
   promise is used. Failure or timeout leaves the row for retry and the customer still gets their order.
3. A worker endpoint claims due rows one at a time (so two workers cannot send the same email), retries with
   doubling delays, and stops after 6 attempts.
4. Triggers for the worker, all free: Vercel's daily scheduled job, plus a sweep whenever an admin opens the
   dashboard or a new order arrives. If retries within minutes matter, a free GitHub Actions schedule can call the
   endpoint every 10 minutes. Vercel's free plan allows scheduled jobs only once a day; I will confirm that limit
   in Vercel's current documentation before relying on it.
5. Events: new order (once, never on edit), payment verified, payment failed, order declined.
6. Tests use Resend's test addresses. No email goes to a real customer or to the admin from automated tests.

## 9. Address enrichment (stage 4)

Zone, street number and building number come from Qatar's official blue-plate system. That data is not in
OpenStreetMap in any complete form, and I know of no free, openly licensed source for it. So the plan is:

- Measure how many Qatar buildings in the map extract carry house-number tags, and use them where they exist.
- Parse a typed address ("Zone 38, Street 840, Building 12", Arabic or English) into the right fields.
- Leave a provider slot in the server for a secondary geocoder, switched off. A paid provider is not added, in line
  with your free-only rule, unless you ask for one after seeing the measured gap.
- Never fill zone or building from an approximate result.

## 10. Payments (stages 5 and 6)

Card payment cannot go live without a merchant account, and every provider charges fees, so this part cannot be
free. I will compare QNB, SkipCash and SADAD from their current public documentation and write
`PAYMENT_INTEGRATION.md`. I will build the models, the adapter interface, the webhook pipeline and a local
simulator that exists only in tests. The real adapter is written against the chosen provider's sandbox once you
have sandbox credentials. Until then the status is BLOCKED BY EXTERNAL PROVIDER, and the card option stays hidden
on the live site. A card session is created only after the delivery charge is confirmed, and a changed total
cancels the old session.

## 11. Environment variables

| Variable | Purpose | Where |
|---|---|---|
| `EMAIL_PROVIDER_API_KEY` | Resend key | Saved locally today; you add it in Vercel |
| `EMAIL_FROM` | Sender, on a domain verified in Resend | Vercel |
| `ORDER_NOTIFICATION_EMAIL` | Admin Gmail address | Vercel |
| `PUBLIC_SITE_URL` | For the admin link in the email | Vercel |
| `WORKER_SECRET` (or Vercel's `CRON_SECRET`) | Protects the worker endpoint | Vercel |
| `PAYMENT_PROVIDER`, provider keys, webhook secret | Later, with the merchant account | Vercel |

None is exposed to the browser. `.env.example` is updated with each.

## 12. External accounts and steps only you can do

- Resend: verify the sending domain (add the DNS records Resend shows for `qleaves.qa`). Without a verified
  domain Resend only delivers to the account owner's own address.
- Vercel: add the variables above.
- Payment provider: merchant onboarding and sandbox credentials.
- Database: apply PG migrations 6, 7 and 8 through the hidden-input window, each before its push.

## 13. Testing strategy

- Every bug gets a failing test first, on SQLite; schema-sensitive ones also run against PostgreSQL semantics.
- Playwright runs against a local server with its own SQLite file seeded with 500 products and six images each.
  It never touches production, sends no real email and uses no real card.
- Visual checks at 320, 360, 390, 430, 768, 1024 and 1440, English and Arabic, with screenshots I look at.
- The project's overlap audit runs before any UI stage is called finished.

## 14. Performance impact

- Order request: one extra insert, and up to 5 seconds added only when Resend is slow.
- Admin lists: far smaller responses once paged.
- Storefront bundle: no growth expected; payment and admin code stays in lazy chunks.
- Image storage: one more small file per image (about 15 to 25 kB estimated; measured in stage 7).

## 15. Rollback

- Each stage is its own commit; reverting the commit and redeploying restores the previous behaviour.
- Migrations are additive, so older code keeps working against the newer database. Nothing needs to be undone
  in the database to roll code back.
- Email and payments are switched by environment variables: remove the variable and the feature is off.

## 16. Decisions

Answered by the owner on 2026-11-15:

- **D1.** Order emails go to the shop's Gmail address (set as `ORDER_NOTIFICATION_EMAIL`). To start, the sender is
  Resend's shared `onboarding@resend.dev`, which needs no DNS records as long as the recipient is the Resend
  account's own address. A branded sender on `qleaves.qa` (DNS records from the Resend dashboard) is a later step.
- **D2.** Default kept: retry when an admin opens the dashboard or a new order arrives, plus once a day.
- **D3.** Payment provider: later. Models, webhook pipeline and test simulator are built; the card option stays hidden.
- **D4.** The 2026-11-13 behaviour stands: nothing while the cart is empty, a mini banner after browsing a while
  with items. Stage 11 only verifies this and makes no change to the empty state.

Original questions:

- **D1. Sender and recipient.** Which address receives order emails, and can you add DNS records for `qleaves.qa`?
- **D2. Retry timing.** Daily retry plus sweeps on admin visits (default), or also the 10-minute GitHub schedule?
- **D3. Payment provider.** Has the client started onboarding with QNB, SkipCash or SADAD?
- **D4. Floating cart when empty.** This brief asks for a compact indicator while the cart is empty. On
  2026-11-13 you asked for the opposite (nothing when empty; a mini banner only after browsing a while with
  items). Which one stands?
- **D5. Playwright.** Earlier briefs said not to use it; this one requires it. I will treat it as required.
- **D6. Earlier checkout roadmap.** Its P1 items are covered by stages 1 and 2; the customer-email question
  (keep or drop the email field) is still open, and the order email now uses that field.
