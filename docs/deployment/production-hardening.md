# Production hardening runbook

This release adds persistent rate limiting, request correlation, privacy-safe structured diagnostics, report-only CSP collection, signed direct image uploads, responsive images, and a dynamic sitemap. It does not perform any live deployment automatically.

## Pre-deployment gate

From a clean trusted checkout at the intended release commit:

```bash
npm ci
npm run prisma:generate -w @qleaves/api
npm run supabase:validate
npm test
npm run typecheck
npm run build
npm run verify:vercel-config
```

Configure the server-only values listed in `vercel-supabase.md`. Generate `RATE_LIMIT_SALT` with a cryptographically secure generator, use at least 32 characters, and keep it stable within an environment. Rotating it resets the logical identity of rate-limit buckets. Run `npm run vercel-build` locally with a production-shaped, non-secret test environment before deploying.

## Schema and release procedure

1. Generate and validate the PostgreSQL client with `npm run supabase:generate` and `npm run supabase:validate`.
2. Review the pending schema diff against the intended Supabase project.
3. Run `npm run supabase:deploy` manually from the trusted administrative environment. Stop on any data-loss warning.
4. Configure the public image bucket as described in `product-image-storage.md`; anonymous browser mutation policies must remain disabled.
5. Deploy the Vercel commit only after the schema succeeds.
6. Run the four smoke requests in `vercel-supabase.md` and retain any failing response's `x-request-id` for log correlation.
7. In a non-production account/environment, verify login throttling survives a function restart and verify one complete signed direct-upload/finalization flow.

Backups are operator-deferred and are not created, configured, or verified by this release.

## CSP review and promotion

The release sends `Content-Security-Policy-Report-Only` and ingests bounded reports at `/api/v1/security/csp-report`. During an observation window:

1. Group structured `csp-report` events by blocked origin and directive.
2. Confirm legitimate QLeaves, Google Fonts, Supabase Storage, Anime.js, and Three.js traffic is covered.
3. Investigate new origins; do not whitelist an origin solely because it appears in a report.
4. Remove obsolete allowances, repeat the smoke tests, then promote to an enforcing header in a separate reviewed change.

## Diagnostics and privacy

Every request accepts a valid inbound request ID or receives a generated one, returns it as `x-request-id`, and includes it in structured error/security logs. Search logs by that ID. Rate-limit records contain only HMAC-keyed hashes; raw IP addresses, credentials, signed upload tokens, storage response bodies, and request bodies must never be logged.

## Rollback

The hardening work is isolated by commit, so application rollback means redeploying the last known-good commit or reverting the specific latest commit in a new reviewed change. Do not rewrite branch history. If a release fails before schema deployment, stop and redeploy the prior commit. If application deployment fails after schema deployment, the added nullable media columns and rate-limit table are backward-compatible with the prior application; redeploy the prior application first, then assess schema cleanup separately. Never drop tables or columns as an emergency response.

After rollback, repeat `health`, `ready`, `products`, and `sitemap.xml` checks and correlate failures by request ID. Storage objects created during an interrupted upload may remain staged; clean them only with an explicit, path-scoped administrative procedure.
