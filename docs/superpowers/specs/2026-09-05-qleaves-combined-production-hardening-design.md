# QLeaves Combined Production Hardening Design

## Scope

This release completes the deferred production-hardening roadmap in one coordinated branch while keeping each concern isolated and independently testable. It adds shared abuse controls, a staged Content Security Policy, privacy-safe operational logging, optimized responsive product images, a database-backed sitemap, and direct authenticated uploads to Supabase Storage.

Database and Storage backups are explicitly out of scope at the user's request. The release does not introduce server-side rendering, a third-party monitoring account, analytics, advertising trackers, or a cookie-consent banner.

## Constraints

- Preserve the current React/Vite frontend, Express API, Prisma dual-schema setup, Vercel deployment model, and Supabase PostgreSQL/Storage architecture.
- Preserve existing product rows and existing `ProductMedia.url` values without a destructive or bulk data migration.
- Never expose `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, database credentials, or customer data to frontend code or logs.
- Keep SQLite development functional without Supabase configuration.
- Do not run production schema changes automatically during a Vercel build.
- Apply all behavior changes test-first and verify the full repository after each implementation stage.

## Delivery strategy

The work is delivered as one release branch but implemented as separate, reviewable stages. Each stage has a focused test cycle and commit. A final integration pass verifies all stages together. This limits corruption risk and makes any problematic stage independently revertible.

## Shared rate limiting

The current login and public-order limiters use process-local maps, which are not globally consistent across Vercel function instances. The release adds a `RateLimitBucket` Prisma model to both SQLite and PostgreSQL schemas with a compound identity for limiter name and hashed client key, a window expiration timestamp, and an integer attempt count.

The limiter service performs an atomic database transaction. It removes or replaces an expired bucket, increments an active bucket, and returns the remaining retry interval when the configured limit is exceeded. Raw IP addresses are never stored: the service hashes the normalized client identifier with a server-only `RATE_LIMIT_SALT`. Production environment validation requires a strong salt. Tests use a deterministic test salt.

Three policies use the shared service:

- Admin login: the existing attempt/window semantics remain unchanged.
- Public order creation: the existing 10 attempts per 15 minutes policy remains unchanged.
- Signed-upload authorization and finalization: a conservative per-admin/IP policy prevents Storage abuse.

The API fails closed for login and upload authorization if the limiter cannot be checked. Public order creation returns a temporary service error rather than silently disabling abuse protection. Successful login clears the matching login bucket. Expired rows are removed opportunistically; no scheduled job is required at launch scale.

## Content Security Policy

Vercel continues to serve the existing security headers. A `Content-Security-Policy-Report-Only` header is added first. The policy permits the application bundle and styles from the QLeaves origin, product images from the configured Supabase HTTPS origin, API calls to the same origin, and the minimum current inline/style requirements proven by the built application. It denies plugins, frames, framing, and unexpected base/form destinations.

The policy is constructed from a checked-in template using an environment-neutral Supabase host pattern that does not expose a project secret. A same-origin `/api/v1/security/csp-report` endpoint accepts only the browser CSP report media types, uses a small body limit, rate-limits submissions, redacts query strings and user-controlled samples, and emits one-line structured events. It returns `204` and never writes reports to the application database.

Enforcement is intentionally deferred until production report-only telemetry shows no legitimate violations. Deployment documentation explains the promotion checklist from report-only to enforced policy.

## Operational error reporting

No third-party monitoring provider is added. The API error handler emits structured JSON logs for unexpected errors with a generated request identifier, HTTP method, normalized route/path, error name, and stack in non-production or the Vercel log stream. It never logs request bodies, cookies, authorization headers, URLs with query strings, database URLs, Storage keys, email addresses, phone numbers, postal addresses, or order notes.

Every API response includes `X-Request-Id`; an incoming identifier is accepted only when it matches a conservative length and character allowlist. Error responses include the request identifier while retaining the existing generic public message. The frontend displays that identifier for unexpected API failures so support can correlate a customer report with Vercel logs.

## Direct product-image upload

The current Base64 creation contract remains available only for SQLite development and compatibility tests. PostgreSQL production uses a two-phase direct-upload flow:

1. An authenticated administrator submits image metadata to an authorization endpoint.
2. The API validates MIME type and declared byte size, chooses a random `products/staging/...` object path, requests a short-lived Supabase signed-upload token with the server key, records no product yet, and returns only the path, token, upload URL information, and expiry required by the browser.
3. The browser uploads the binary file directly to Supabase Storage using the signed token. The server key is never returned.
4. The browser calls the product-creation endpoint with the server-issued staging path and normal product fields.
5. The API downloads the staged object through authenticated Storage access, enforces the two-MiB limit, validates the real file signature, and verifies that the path is inside the expected staging prefix.
6. The API copies the validated variants to immutable final paths, creates the product with those final public URLs in one database transaction, and then removes the staging objects. If copying or database creation fails, it removes final objects created by that attempt and preserves the original error. A failed staging cleanup is logged for later housekeeping without invalidating an otherwise successful product creation.

Upload authorization tokens are short-lived and non-upserting. Paths are random and server-generated. A client-supplied public URL or arbitrary Storage path is never trusted.

## Image optimization and responsive delivery

Supabase hosted image transformations are not assumed because the feature is plan-dependent. The admin browser generates web-ready variants before requesting signed uploads:

- A catalogue WebP constrained to 640 pixels on its longest edge.
- A product-detail WebP constrained to 1400 pixels on its longest edge.
- Quality is selected conservatively and dimensions are never enlarged.

Browser-side decoding uses standard `createImageBitmap`/canvas APIs with explicit failure handling. The server validates the actual uploaded bytes, dimensions, MIME type, and size during finalization. Animated GIF input remains supported by the compatibility path but direct optimization rejects animation rather than silently flattening it; the admin receives a clear instruction to use JPEG, PNG, or WebP.

`ProductMedia` gains optional `width`, `height`, and `purpose` metadata while retaining the existing URL and ordering fields. Existing rows remain valid with null metadata and continue to render through the legacy fallback. New products store catalogue and detail variants as separate media rows.

Catalogue and product components render a `<picture>`/responsive image contract with explicit width and height, lazy loading below the fold, asynchronous decoding, and fallback behavior. Cart snapshots continue to store a single display image URL and require no migration.

## Dynamic sitemap and SEO

The checked-in static `apps/web/public/sitemap.xml` is removed to prevent it from shadowing runtime routing. A public API-backed sitemap handler at `/sitemap.xml` queries only published products, escapes XML values, emits the stable public pages plus current `/plants/:slug` URLs, and returns `application/xml` with a bounded CDN cache and stale-while-revalidate policy.

The sitemap query selects only slugs and update timestamps and uses deterministic ordering. Database failure returns a controlled `503` XML response rather than a partial or misleading sitemap. `robots.txt` continues to reference `https://qleaves.qa/sitemap.xml`.

Product pages keep their existing live Product/Offer structured data and canonical metadata. The release strengthens image dimensions/URLs and 404 `noindex` behavior but does not claim server-rendered SEO. A future SSR or prerender migration remains separate because it would change the deployment architecture.

## Environment and deployment validation

Production validation adds `RATE_LIMIT_SALT` and verifies that all server-only values are non-empty and not exposed through `VITE_` names. Storage configuration is centralized so the same normalized origin and bucket rules are used by uploads, public URLs, and CSP generation.

The Vercel configuration checker verifies the sitemap route precedes the SPA fallback, the CSP report endpoint reaches Express, security headers are present, and the static sitemap no longer exists. Deployment documentation covers bucket restrictions, allowed MIME types, the two-MiB maximum, signed-upload behavior, CSP report review, schema deployment, and rollback.

## Schema safety

Both Prisma schemas receive the same additive models/fields. SQLite receives a forward migration that creates the rate-limit table and adds nullable `width`, `height`, and `purpose` columns to `ProductMedia`. PostgreSQL continues to use the existing deliberate `prisma db push` command; the build only generates and validates clients.

No existing product, order, session, inventory, or media row is deleted or rewritten. Production deployment must review Prisma output and must not use `--accept-data-loss`.

## Testing and verification

Each behavior starts with a failing test. Coverage includes:

- Atomic shared rate-limit increments, expiry, clearing, hashing, concurrency, and dependency failure.
- Login, order, upload, and CSP-report integration behavior.
- Request-ID validation, propagation, safe error responses, and log redaction.
- Signed-upload authorization, staging-path ownership, expiry, byte/signature/dimension validation, finalization, and cleanup failures.
- Browser image resizing without enlargement, variant metadata, failure states, and direct-upload orchestration.
- Legacy media rendering and responsive new-media rendering.
- XML escaping, published-product filtering, deterministic sitemap output, caching, and database failure.
- Dual-schema parity and production environment/configuration validation.

The final gate runs all API and web tests, TypeScript checks, production builds, Prisma generation and schema validation, Vercel configuration checks, `git diff --check`, a secret scan of changed files, and a manual review of the complete diff. The production database and Storage bucket are not mutated during automated verification.

## Rollback

The release remains backward-compatible with existing media rows and the Base64 SQLite path. If direct uploads must be disabled, the admin UI can be rolled back without invalidating existing products. If shared rate limiting must be rolled back, its additive table can remain unused. CSP starts report-only, so policy mistakes cannot block storefront resources. The runtime sitemap can be replaced by the prior static file without changing product records.
