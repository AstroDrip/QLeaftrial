# Vercel + Supabase deployment

QLeaves deploys as one Vercel project. Vite builds the storefront into `apps/web/dist`; `api/index.ts` exposes Express as a Node.js Vercel Function. Local development continues to use the Vite proxy and SQLite.

## Vercel project settings

Use the repository root as the Vercel Root Directory and keep Build Command and Output Directory on repository settings; `vercel.json` owns both.

- Node.js: **24.x**
- Build command: `npm run vercel-build`
- Output directory: `apps/web/dist`
- Install command: root default
- Function: `api/index.ts`, maximum duration 30 seconds

## Connect `qleaves.qa`

In the Vercel project, open **Settings → Domains** and add both `qleaves.qa` and
`www.qleaves.qa`. Set `qleaves.qa` as the primary domain; the checked-in Vercel
redirect permanently sends `www.qleaves.qa` (including paths and query strings)
to the canonical HTTPS host.

At the domain registrar/DNS provider, apply the records Vercel displays for
these domains. DNS recommendations can vary by project and provider; do not
replace existing mail-related MX, SPF, DKIM, or DMARC records. Remove only
conflicting website records if Vercel identifies them. Wait for Vercel to
confirm both domain assignments and issue HTTPS certificates before announcing
the site. Domain registration alone does not connect it to the deployment.

After DNS and certificate provisioning, verify:

```text
https://qleaves.qa/
https://www.qleaves.qa/  (should permanently redirect to https://qleaves.qa/)
https://qleaves.qa/api/v1/health
https://qleaves.qa/sitemap.xml
```

Canonical metadata, structured data, `robots.txt`, and the dynamic sitemap use
`https://qleaves.qa` as their canonical origin.

Set these server-only runtime variables for Production and for every Preview that needs an API:

```text
QLEAVES_DATABASE_PROVIDER=postgresql
DATABASE_URL=<Supabase transaction-pooler URL>
RATE_LIMIT_SALT=<unique random value of at least 32 characters>
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_PRODUCT_IMAGE_BUCKET=product-images
```

`SUPABASE_SERVICE_ROLE_KEY` is a legacy alternative to `SUPABASE_SECRET_KEY`. `DIRECT_URL` is used only by deliberate schema administration and is not required by the running application. Never create a `VITE_*` copy of any server credential, database URL, salt, or seed password. The build verifier rejects such copies and reports variable names only.

## Optional: mirror orders into a Google Sheet

Every new order, status change, payment change and edited order is copied to one row of a private Google Sheet (matched by order number), and **Admin → Dashboard → Sync all orders now** brings the sheet fully up to date. Customer email is never written to the sheet. The sheet is a convenience copy: if Google is slow or down the order is still saved and the customer is not affected.

1. In Google Cloud, create a project, enable the **Google Sheets API**, create a **service account**, and download a JSON key for it.
2. Create an empty Google Sheet and share it (Editor) with the service account's `client_email`. Keep it private.
3. Add three server-only variables in Vercel (Production, and any Preview that should write to the sheet):

```text
GOOGLE_SHEETS_ID=<the long id in the sheet URL between /d/ and /edit>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email from the JSON key>
GOOGLE_PRIVATE_KEY=<private_key from the JSON key, pasted as-is>
```

`GOOGLE_SHEETS_TAB` is optional and defaults to `Orders`; the tab and header row are created automatically. Redeploy after saving the variables. Never create a `VITE_*` copy and never commit or share the JSON key; the build verifier rejects public copies of these names.

## Database connections and initialization

Use Supavisor transaction mode on port `6543` for serverless `DATABASE_URL`; with Prisma 6, append `pgbouncer=true&connection_limit=1`. Percent-encode reserved password characters. Use the direct endpoint or Supavisor session mode on port `5432` for administrative `DIRECT_URL`.

The running app talks to PostgreSQL through `pg` and Prisma's `PrismaPg` adapter with a pool of one connection per function instance (`DB_POOL_MAX`, capped at 5, raises it). `pg` sends unnamed statements, which the transaction pooler supports. Keep the Vercel function region (`bom1` in `vercel.json`, matching the Mumbai project ap-south-1) next to the Supabase project's region; check the region under Supabase → Project Settings → General and change `regions` only if they differ.

### Schema changes: versioned migrations

Production schema changes are versioned migrations in `apps/api/prisma/postgresql/migrations`, applied with `prisma migrate deploy`. `db push` is no longer used. `0_init` is the schema that production already had (created earlier with `db push`); later folders are additive changes.

One time only, a database created with `db push` is told that `0_init` is already applied. From a trusted shell with `DATABASE_URL`, `DIRECT_URL` and `QLEAVES_DATABASE_PROVIDER=postgresql` set:

```bash
npm run supabase:check      # read-only: prints what differs from the schema; expect only the idempotency key
npm run supabase:baseline   # records 0_init as applied (writes only Prisma's _prisma_migrations table)
npm run supabase:deploy     # applies the pending migrations (1_order_idempotency_key: a nullable column and an index)
npm run supabase:status     # should report the database schema is up to date
```

If `supabase:check` reports anything other than the idempotency key, stop and review it before baselining. After the baseline, every later schema change is just `npm run supabase:deploy`. `docs/deployment/operator-checklist.md` has the same steps for PowerShell.

Seeding is separate and never part of a deploy: `npm run supabase:seed` needs a strong temporary `QLEAVES_ADMIN_SEED_PASSWORD` (and `ALLOW_PRODUCTION_SEED=true` when `NODE_ENV=production`); it never overwrites existing products, stock or photos. Remove the seed password immediately afterward and do not configure it as an application runtime variable.

### Public catalogue snapshot

`npm run vercel-build` writes `apps/web/public/catalogue/catalogue.json` from the published products (read-only) before building the storefront. It is the last-resort copy behind the CDN-cached `/api/v1/catalogue`. If the database cannot be reached during the build, the snapshot is skipped and the build carries on. The file is git-ignored; never commit it.

## Deployment checks

After deployment, request these in order:

```text
https://YOUR_DEPLOYMENT/api/v1/health
https://YOUR_DEPLOYMENT/api/v1/ready
https://YOUR_DEPLOYMENT/api/v1/products?page=1
https://YOUR_DEPLOYMENT/api/v1/catalogue
https://YOUR_DEPLOYMENT/api/v1/reviews
https://YOUR_DEPLOYMENT/sitemap.xml
```

`health` verifies function routing, `ready` verifies schema reachability, `products` and `catalogue` verify the public queries (both should carry `s-maxage=60, stale-while-revalidate`), `reviews` verifies the Review table, and `sitemap.xml` verifies dynamic SEO routing. A database outage answers `503 DATABASE_UNAVAILABLE` with a request ID rather than a generic 500. Preserve the `x-request-id` response header when investigating an error; use it to find the matching structured Vercel log without searching for customer data.

If an API URL returns the React document, confirm the Root Directory and dashboard overrides. If `health` succeeds but `ready` fails, use the request ID to inspect connection/schema errors and run schema commands only against the explicitly intended database.

If Prisma reports `Authentication failed against database server`, the application has reached PostgreSQL but Supabase rejected the username/password in `DATABASE_URL`. Copy a fresh **transaction pooler** connection string from the intended Supabase project, replace the password with that project's current database password, percent-encode reserved password characters, update the Vercel variable for every intended environment, and redeploy. Do not use the Supabase API/service-role key as the database password. A successful `/api/v1/health` only proves function routing; `/api/v1/ready` is the database credential/schema check.

Arabic catalogue copy is stored in the nullable `nameAr`, `descriptionAr`, `categoryAr`, and `lightAr` product columns. Existing rows remain readable, but editors should populate all four Arabic values in Admin Products so Arabic storefront pages never need the legacy English fallback.

## Preview, security, and caching

Use a separate Preview database/bucket if Preview can create orders or products. `npm run vercel-build` validates configuration, generates clients, checks types, and builds; it does not deploy a schema or seed data.

The Content Security Policy is report-only during this release. Review structured `csp-report` events before promotion to enforcement; do not copy full report payloads into tickets if they contain customer URLs. Hashed Vite assets receive immutable caching, the dynamic sitemap uses a five-minute shared cache with stale revalidation, and API/admin responses remain controlled by Express.

See `production-hardening.md` for the release and rollback checklist and `product-image-storage.md` for bucket and upload verification.
