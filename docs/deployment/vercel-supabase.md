# Vercel + Supabase deployment

QLeaves deploys as one Vercel project. Vite builds the storefront into `apps/web/dist`; `api/index.ts` exposes Express as a Node.js Vercel Function. Local development continues to use the Vite proxy and SQLite.

## Vercel project settings

Use the repository root as the Vercel Root Directory and keep Build Command and Output Directory on repository settings; `vercel.json` owns both.

- Node.js: **24.x**
- Build command: `npm run vercel-build`
- Output directory: `apps/web/dist`
- Install command: root default
- Function: `api/index.ts`, maximum duration 30 seconds

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

## Database connections and initialization

Use Supavisor transaction mode on port `6543` for serverless `DATABASE_URL`; with Prisma 6, append `pgbouncer=true&connection_limit=1`. Percent-encode reserved password characters. Use the direct endpoint or Supavisor session mode on port `5432` for administrative `DIRECT_URL`.

From a trusted shell, set `DATABASE_URL`, `DIRECT_URL`, `QLEAVES_DATABASE_PROVIDER=postgresql`, and a strong temporary `QLEAVES_ADMIN_SEED_PASSWORD`, then deliberately run:

```bash
npm run supabase:generate
npm run supabase:validate
npm run supabase:deploy
npm run supabase:seed
```

`supabase:deploy` never accepts data loss automatically. Review every schema warning. Seeding is separate from Vercel builds; remove `QLEAVES_ADMIN_SEED_PASSWORD` immediately afterward and do not configure it as an application runtime variable.

## Deployment checks

After deployment, request these in order:

```text
https://YOUR_DEPLOYMENT/api/v1/health
https://YOUR_DEPLOYMENT/api/v1/ready
https://YOUR_DEPLOYMENT/api/v1/products?page=1
https://YOUR_DEPLOYMENT/sitemap.xml
```

`health` verifies function routing, `ready` verifies schema reachability, `products` verifies the public query, and `sitemap.xml` verifies dynamic SEO routing. Preserve the `x-request-id` response header when investigating an error; use it to find the matching structured Vercel log without searching for customer data.

If an API URL returns the React document, confirm the Root Directory and dashboard overrides. If `health` succeeds but `ready` fails, use the request ID to inspect connection/schema errors and run schema commands only against the explicitly intended database.

## Preview, security, and caching

Use a separate Preview database/bucket if Preview can create orders or products. `npm run vercel-build` validates configuration, generates clients, checks types, and builds; it does not deploy a schema or seed data.

The Content Security Policy is report-only during this release. Review structured `csp-report` events before promotion to enforcement; do not copy full report payloads into tickets if they contain customer URLs. Hashed Vite assets receive immutable caching, the dynamic sitemap uses a five-minute shared cache with stale revalidation, and API/admin responses remain controlled by Express.

See `production-hardening.md` for the release and rollback checklist and `product-image-storage.md` for bucket and upload verification.
