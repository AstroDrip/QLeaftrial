# Stage 9: what needs the owner (Vercel, Supabase, backups)

Written 2026-11-18. Everything below is either a check in your dashboards or a script you run yourself; no secret
is ever typed into the chat. Scripts ask for connection strings with hidden typing and clear them afterwards.

## 1. Before pushing this branch: database migrations 8 to 9c

Folders are named 8, 9, 9a, 9b, 9c (not 10, 11, 12) because Prisma applies them in text order and "10_" would run
before "2_"; `tests/migrations-order.test.ts` keeps it that way.

- 8, 9, 9a, 9b only add (photo columns and an index, care columns, size columns, list indexes).
- 9c is the data change you asked for on 2026-11-18: every product at 99 QAR goes to 0 QAR, published or not stays
  as it is, other prices untouched. Customers then see "Price coming soon" and cannot order those plants until a
  price is set in admin. Push the branch right after applying it (today's live code would show "0 QAR").

Run `qleaves-migrations-8-9c.ps1` (in the session scratchpad): it shows what is pending and the price counts, asks
before applying, then shows the counts again (none left at 99 QAR, the same number published). The Vercel build
refuses to deploy while a migration is missing.

## 2. Vercel environment variables to confirm (names only; values stay in Vercel)

| Variable | Needed for | If missing |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | the database (pooler 6543, direct 5432) | site down (already set: the site works) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`), `SUPABASE_PRODUCT_IMAGE_BUCKET` | admin photo uploads, the daily storage clean-up | uploads fail; clean-up skips itself |
| `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, `ORDER_NOTIFICATION_EMAIL` | order emails (Resend) | orders still save; emails wait as "not configured" |
| `CRON_SECRET` (16+ random characters) | the worker endpoint (daily job and `pg_cron`) | the worker refuses every call (401) |
| `RATE_LIMIT_SALT` | private rate-limit keys, signed invoice links | sign-in, orders and invoice links fail (already set: orders work) |
| `PUBLIC_SITE_URL` | links in emails | defaults to https://qleaves.qa |
| `ALLOWED_ORIGINS` (optional, new) | extra sites allowed to make admin changes, comma separated | only qleaves.qa, www.qleaves.qa and the deployment's own host are allowed |

## 3. Daily job

`vercel.json` runs `/api/v1/internal/worker?cleanup=1` every day at 03:00 UTC. It sends any waiting emails and sheet
rows and, new in this branch, removes unfinished photo uploads and unused product photo files older than a day
(never a referenced photo, never review photos). After the push: Vercel, Project, Settings, Cron Jobs should list it;
its log should show a 200 answer each day.

## 4. Every-minute worker (`pg_cron`)

Not set up yet. Steps and the SQL are in `docs/deployment/outbox-worker.md` ("Setting up the one-minute trigger").
Check first in Supabase, Database, Extensions that `pg_cron` and `pg_net` can be enabled on the free plan.
Without it, waiting emails go out when an admin opens the orders page or at the daily job.

## 5. Content Security Policy: from report-only to enforced

Tested here on the production build with the policy enforced: 28 pages (home, shop, product, cart, checkout with
the map, About, privacy, and every admin page, English and Arabic, including choosing a photo) and no violations;
an injected inline script was blocked, so the policy was really active.

What only you can see: the live reports. In Vercel, Logs, search for `csp-report` over the last two weeks. If there
are none, or only from browser extensions (`chrome-extension://`, `moz-extension://`), tell me and I will switch the
header to `Content-Security-Policy` in its own small commit, as `production-hardening.md` asks.

## 6. Backups and the restore drill

Run `qleaves-backup-drill.ps1` (in the session scratchpad). It:

1. reads the Mumbai database once, read-only, in one consistent snapshot, into
   `Documents\qleaves-backups\qleaves-<date>.json.gz` on this computer;
2. restores that file into a throwaway PostgreSQL on this computer with every migration, compares every table (row
   counts and a fingerprint of the full contents) and deletes the throwaway database.

It ends with `QLEAVES-BACKUP-RESULT: SUCCESS` when the file restores exactly. The file holds customer names, phones
and addresses: keep it private. A weekly run, kept for a few weeks, is a reasonable rhythm.

Also check in Supabase, Database, Backups what the free plan keeps by itself; this script does not depend on it.
Tested here: `apps/api/tests/pg/backup-postgresql.test.ts` (Arabic text, dates, enums, JSON) and a full drill run.

## 7. Dependency audit (2026-11-18)

`npm audit`: nothing in what the browser loads or what the live server runs. The findings are in development and
build tools: Vitest and Vite (test runner and bundler, 2 critical and several high) and the Prisma command-line tool
(migrations only, 4 high, through `deepmerge-ts` and `effect`). Every fix is a major upgrade (Prisma 7, Vitest 5);
worth doing as its own piece of work, not mixed into this release.
