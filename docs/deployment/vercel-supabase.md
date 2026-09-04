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

Set both runtime variables for **Production** and for every **Preview**
environment that should have a working API. The Vercel build stops early with
a safe error message when either value is absent or malformed; it never prints
the connection string.

`DIRECT_URL` is an administrative Prisma variable, not a requirement for the
running Vercel application. Set it in the environment where deliberate schema
deployment commands are executed.

Do not put database credentials in `.env.example`, source files, Vercel config, or frontend `VITE_*` variables.

## Supabase connection strings

For Vercel/serverless runtime traffic, use Supabase Supavisor **transaction mode** on port `6543` for `DATABASE_URL`. With Prisma 6, append the PgBouncer compatibility setting and keep the client connection limit conservative, for example:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

Percent-encode reserved characters in the database password before placing it
in a URL. For example, `@` becomes `%40` and `#` becomes `%23`.

Use `DIRECT_URL` only for deliberate Prisma administrative operations. Prefer the direct database endpoint on port `5432` when your network can reach it; otherwise use Supavisor session mode on port `5432`.

## First production database initialization

Set `DATABASE_URL`, `DIRECT_URL`, `QLEAVES_DATABASE_PROVIDER=postgresql`, and
`QLEAVES_ADMIN_SEED_PASSWORD` in the trusted shell where you run these
commands. The seed password must be a strong, unique production password of at
least 12 characters; the known local-development password is rejected for
PostgreSQL seeding. Then run
from the repository root:

```bash
npm run supabase:generate
npm run supabase:validate
npm run supabase:deploy
npm run supabase:seed
```

`supabase:deploy` uses the repository's existing `prisma db push` production strategy and intentionally does **not** pass `--accept-data-loss`. Review any warning before proceeding. `supabase:seed` is deliberately separate so product/admin seed data is never written by a Vercel build.

Remove `QLEAVES_ADMIN_SEED_PASSWORD` from the shell immediately after the seed
finishes. It is only used to hash the initial admin credential; the running API
does not need it, so do not add it to Vercel's runtime variables.

Run `supabase:deploy` again only when an intentional PostgreSQL schema change is ready to be applied. Run `supabase:seed` only when you explicitly want to restore/update the initial seed catalogue/admin data.

Run these commands from a trusted local shell or protected administrative
environment. Do not put `DIRECT_URL`, the admin seed password, or any other
secret in a frontend `VITE_*` variable.

## Deployment health checks

After deployment, test these endpoints in order:

```text
https://YOUR_DEPLOYMENT/api/v1/health
https://YOUR_DEPLOYMENT/api/v1/ready
https://YOUR_DEPLOYMENT/api/v1/products?page=1
```

- `/health` proves that Vercel loaded and routed the Express function.
- `/ready` also verifies that the expected product table is reachable.
- `/products` verifies the public catalogue query and seeded data.

If an API URL returns the React HTML document, confirm that Vercel's Root
Directory is the repository root and that dashboard build/output settings are
not overriding `vercel.json`. If `/health` works but `/ready` fails, inspect the
Function log for a Supabase connection or missing-schema error, then run the
explicit initialization commands above against the intended database.

## Preview deployments

`npm run vercel-build` validates runtime configuration, generates Prisma clients,
checks types, and builds code. It never runs `prisma db push`, migrations, or
seed commands. If Preview deployments will write test orders/admin edits or
receive schema changes, point Preview at a separate Supabase project/database
instead of production.

## Routing and caching

Requests under `/api/v1/*` are sent to the Express function before the SPA fallback. Vercel checks the filesystem before rewrites, so built assets continue to be served directly. Hashed Vite assets under `/assets/*` receive a one-year immutable cache header. General responses receive conservative security headers; API caching remains controlled by Express so admin/session/product writes are not hidden behind a stale CDN response.
