# Vercel + Supabase deployment

QLeaves deploys as one Vercel project: Vite produces the static storefront in `apps/web/dist`, while `api/index.ts` exports the existing Express application as a Node.js Vercel Function. Local development remains unchanged: Vite proxies `/api` to the listening Express server and the API uses SQLite unless `QLEAVES_DATABASE_PROVIDER` is overridden.

## Vercel project settings

Use the repository root as the project root. `vercel.json` owns the build/output/routing settings, so keep the dashboard Build Command and Output Directory on **Use Project Settings / repository configuration** rather than overriding them.

- Node.js: **24.x** (also pinned by the root `package.json`)
- Build command: `npm run vercel-build`
- Output directory: `apps/web/dist`
- Install command: default `npm install` from the root lockfile
- Express function: `api/index.ts`, maximum duration 30 seconds
- Production runtime environment variables:
  - `QLEAVES_DATABASE_PROVIDER=postgresql`
  - `DATABASE_URL=<Supabase transaction-pooler URL>`
  - `SESSION_SECRET=<strong random production secret>`

`DIRECT_URL` is an administrative Prisma variable, not a requirement for the
running Vercel application. Set it in the environment where deliberate schema
deployment commands are executed.

Do not put database credentials in `.env.example`, source files, Vercel config, or frontend `VITE_*` variables.

## Supabase connection strings

For Vercel/serverless runtime traffic, use Supabase Supavisor **transaction mode** on port `6543` for `DATABASE_URL`. With Prisma 6, append the PgBouncer compatibility setting and keep the client connection limit conservative, for example:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

Use `DIRECT_URL` only for deliberate Prisma administrative operations. Prefer the direct database endpoint on port `5432` when your network can reach it; otherwise use Supavisor session mode on port `5432`.

## First production database initialization

Set `DATABASE_URL`, `DIRECT_URL`, and `QLEAVES_DATABASE_PROVIDER=postgresql` in the shell where you run these commands, then run from the repository root:

```bash
npm run supabase:generate
npm run supabase:validate
npm run supabase:deploy
npm run supabase:seed
```

`supabase:deploy` uses the repository's existing `prisma db push` production strategy and intentionally does **not** pass `--accept-data-loss`. Review any warning before proceeding. `supabase:seed` is deliberately separate so product/admin seed data is never written by a Vercel build.

Run `supabase:deploy` again only when an intentional PostgreSQL schema change is ready to be applied. Run `supabase:seed` only when you explicitly want to restore/update the initial seed catalogue/admin data.

## Preview deployments

`npm run vercel-build` only generates Prisma clients, checks types, and builds code. It never runs `prisma db push`, migrations, or seed commands. If Preview deployments will write test orders/admin edits or receive schema changes, point Preview at a separate Supabase project/database instead of production.

## Routing and caching

Requests under `/api/v1/*` are sent to the Express function before the SPA fallback. Vercel checks the filesystem before rewrites, so built assets continue to be served directly. Hashed Vite assets under `/assets/*` receive a one-year immutable cache header. General responses receive conservative security headers; API caching remains controlled by Express so admin/session/product writes are not hidden behind a stale CDN response.
