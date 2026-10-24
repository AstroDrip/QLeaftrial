# QLeaves Combined Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver shared abuse controls, safe production diagnostics, report-only CSP, direct optimized product-image uploads, and an automatically current sitemap as one backward-compatible QLeaves release.

**Architecture:** Additive Prisma changes provide shared rate-limit state and optional media metadata. Express owns security, upload finalization, sitemap generation, and safe logging; the React admin prepares optimized WebP variants and uploads them directly with server-issued short-lived tokens. Existing media rows and SQLite development remain compatible.

**Tech Stack:** Node.js 24, TypeScript, Express 5, Prisma 6, SQLite/PostgreSQL, React 19, Vite 7, Vitest, Supabase Storage, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-05-qleaves-combined-production-hardening-design.md`

## Global Constraints

- Preserve the current React/Vite, Express, Prisma, Vercel, and Supabase architecture.
- Backups, SSR, third-party monitoring, analytics, trackers, and cookie consent are out of scope.
- Preserve existing product/media rows and the SQLite Base64 development path.
- Never expose or log server secrets, credentials, cookies, customer bodies, or customer contact/address fields.
- Production schema deployment stays explicit and never runs in `vercel-build`.
- Every behavior change follows red-green-refactor and every task ends with focused and regression verification.

---

### Task 1: Shared database-backed rate limiting

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/schema.postgresql.prisma`
- Create: `apps/api/prisma/migrations/20260905090000_add_rate_limit_and_media_metadata/migration.sql`
- Create: `apps/api/src/lib/rate-limit.ts`
- Create: `apps/api/tests/rate-limit.test.ts`
- Delete: `apps/api/src/modules/auth/login-rate-limit.ts`
- Delete: `apps/api/src/modules/orders/order-rate-limit.ts`
- Modify: `apps/api/src/modules/auth/auth.routes.ts`
- Modify: `apps/api/src/modules/orders/order.routes.ts`
- Modify: `apps/api/tests/auth.test.ts`
- Modify: `apps/api/tests/order-rate-limit.test.ts`
- Modify: `apps/api/tests/schema-parity.test.ts`

**Interfaces:**
- Produces: `consumeRateLimit(input): Promise<{ limited: boolean; retryAfterSeconds: number }>` and `clearRateLimit(input): Promise<void>`.
- Consumes: Prisma delegates, `RATE_LIMIT_SALT`, limiter name, client identifier, maximum attempts, window milliseconds, and optional clock.

- [ ] **Step 1: Add failing service and integration tests**

```ts
it("shares attempts through persisted limiter state", async () => {
  expect(await consumeRateLimit(policy)).toMatchObject({ limited: false });
  expect(await consumeRateLimit(policy)).toMatchObject({ limited: false });
  expect(await consumeRateLimit(policy)).toMatchObject({ limited: true });
});

it("never persists a raw client address", async () => {
  await consumeRateLimit({ ...policy, clientKey: "203.0.113.8" });
  expect(await prisma.rateLimitBucket.findFirst({ where: { keyHash: "203.0.113.8" } })).toBeNull();
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -w @qleaves/api -- tests/rate-limit.test.ts tests/auth.test.ts tests/order-rate-limit.test.ts`
Expected: FAIL because the persistent model/service and asynchronous route behavior do not exist.

- [ ] **Step 3: Add the additive schema and minimal atomic service**

```prisma
model RateLimitBucket {
  limiter   String
  keyHash   String
  attempts  Int
  expiresAt DateTime
  updatedAt DateTime @updatedAt

  @@id([limiter, keyHash])
  @@index([expiresAt])
}
```

Hash `limiter + "\0" + normalizedClientKey` with HMAC-SHA256 using `RATE_LIMIT_SALT`. Use a serializable Prisma transaction with retry only for documented transaction conflicts; expired buckets restart at one attempt. Never store the raw key.

- [ ] **Step 4: Replace login/order map calls with awaited shared calls**

```ts
const decision = await consumeRateLimit({
  limiter: "public-order",
  clientKey,
  limit: 10,
  windowMs: 15 * 60_000,
});
if (decision.limited) response.setHeader("Retry-After", String(decision.retryAfterSeconds));
```

Keep the existing public status/error codes and clear login state after successful authentication.

- [ ] **Step 5: Verify schema parity and regressions**

Run: `npm run prisma:generate -w @qleaves/api && npm test -w @qleaves/api`
Expected: all API tests pass with the new shared limiter.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma apps/api/src/lib/rate-limit.ts apps/api/src/modules/auth apps/api/src/modules/orders apps/api/tests
git commit -m "feat: persist production rate limits"
```

### Task 2: Request correlation and privacy-safe structured logs

**Files:**
- Create: `apps/api/src/middleware/request-context.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/middleware/error-handler.ts`
- Modify: `apps/api/tests/health.test.ts`
- Create: `apps/api/tests/error-handler.test.ts`
- Create: `apps/web/src/lib/api-error.ts`
- Modify: `apps/web/src/features/admin/admin-api.ts`
- Modify: `apps/web/src/features/catalog/product-api.ts`
- Modify: `apps/web/src/features/checkout/CheckoutPage.tsx`
- Modify: affected frontend error-state tests

**Interfaces:**
- Produces: `requestIdFor(value): string`, `requestContext` middleware, and public error `{ code, message, requestId }` for unexpected failures.
- Consumes: optional allowlisted `X-Request-Id` and generated `crypto.randomUUID()`.

- [ ] **Step 1: Write failing request-ID and redaction tests**

```ts
it("correlates a generic error without logging customer input", async () => {
  const response = await request(app).get("/api/v1/test-error").set("X-Request-Id", "support_123");
  expect(response.headers["x-request-id"]).toBe("support_123");
  expect(response.body.error).toMatchObject({ code: "INTERNAL_SERVER_ERROR", requestId: "support_123" });
  expect(logLine).not.toContain("customer@example.com");
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -w @qleaves/api -- tests/error-handler.test.ts tests/health.test.ts`
Expected: FAIL because responses lack request IDs and logs lack the safe structured contract.

- [ ] **Step 3: Implement request context and structured error output**

Accept only `/^[A-Za-z0-9_-]{1,80}$/`; otherwise generate a UUID. Log one JSON object containing request ID, method, pathname without query, error name, message, and stack. Do not serialize the request, headers, body, or environment.

- [ ] **Step 4: Surface correlation IDs in frontend API errors**

Add `ApiClientError` and `errorFromResponse(response)` in `apps/web/src/lib/api-error.ts`, with optional `requestId`. Use it from the admin, catalogue, and checkout request paths and render `Reference: <id>` only for unexpected failures.

- [ ] **Step 5: Verify focused and full tests**

Run: `npm test`
Expected: API and web suites pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src apps/api/tests apps/web/src
git commit -m "feat: add safe request diagnostics"
```

### Task 3: Report-only CSP and CSP-report ingestion

**Files:**
- Modify: `vercel.json`
- Create: `apps/api/src/modules/security/security.routes.ts`
- Create: `apps/api/src/modules/security/csp-report.ts`
- Modify: `apps/api/src/routes.ts`
- Create: `apps/api/tests/security.test.ts`
- Modify: `scripts/verify-vercel-config.mjs`

**Interfaces:**
- Produces: `POST /api/v1/security/csp-report` returning `204` and a `Content-Security-Policy-Report-Only` response header.
- Consumes: browser `application/csp-report` or `application/reports+json` bodies capped at 16 KiB.

- [ ] **Step 1: Write failing route and configuration behavior tests**

```ts
it("accepts a bounded CSP report and removes query strings", async () => {
  const response = await request(app).post("/api/v1/security/csp-report")
    .set("Content-Type", "application/csp-report")
    .send({ "csp-report": { "blocked-uri": "https://cdn.example/x.js?token=secret" } });
  expect(response.status).toBe(204);
  expect(logLine).not.toContain("token=secret");
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -w @qleaves/api -- tests/security.test.ts && npm run verify:vercel-config`
Expected: route test returns 404 and config verifier fails the new CSP expectation.

- [ ] **Step 3: Implement the bounded reporting route**

Use a route-specific raw/text parser limited to `16kb`, normalize only document URI, blocked URI, effective directive, disposition, and status code, strip query/hash fragments, and emit structured JSON. Reuse shared rate limiting with limiter `csp-report`.

- [ ] **Step 4: Add the report-only policy**

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.supabase.co; connect-src 'self'; font-src 'self' data:; report-uri /api/v1/security/csp-report
```

- [ ] **Step 5: Verify API, config, and build**

Run: `npm test -w @qleaves/api && npm run verify:vercel-config && npm run build`
Expected: all commands pass; CSP remains report-only.

- [ ] **Step 6: Commit**

```bash
git add vercel.json scripts/verify-vercel-config.mjs apps/api/src/modules/security apps/api/src/routes.ts apps/api/tests/security.test.ts
git commit -m "feat: add report-only content security policy"
```

### Task 4: Signed direct uploads and server-side finalization

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/schema.postgresql.prisma`
- Modify: Task 1 migration SQL
- Create: `apps/api/src/modules/admin/product-upload.service.ts`
- Modify: `apps/api/src/modules/admin/product-image-storage.ts`
- Modify: `apps/api/src/modules/admin/admin-product.schemas.ts`
- Modify: `apps/api/src/modules/admin/admin-product.routes.ts`
- Modify: `apps/api/src/modules/admin/admin-product.service.ts`
- Create: `apps/api/tests/product-upload.test.ts`
- Modify: `apps/api/tests/admin-products.test.ts`

**Interfaces:**
- Produces: `authorizeProductUpload`, `validateStagedImage`, `finalizeProductImages`, and authenticated routes for authorization/finalization.
- Consumes: `{ purpose, contentType, byteSize, width, height }`, server-generated paths, Supabase signed-upload responses, and final create-product data.

- [ ] **Step 1: Write failing authorization, validation, and cleanup tests**

```ts
it("never returns the Supabase server key", async () => {
  const response = await loggedInAgent().post("/api/v1/admin/product-uploads").send(validMetadata);
  expect(response.status).toBe(201);
  expect(JSON.stringify(response.body)).not.toContain("sb_secret_");
});

it("rejects a staged object whose bytes disagree with its MIME type", async () => {
  await expect(validateStagedImage(stagedPngContainingText)).rejects.toMatchObject({ code: "INVALID_PRODUCT_IMAGE" });
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -w @qleaves/api -- tests/product-upload.test.ts tests/admin-products.test.ts`
Expected: FAIL because signed-upload routes and staging finalization do not exist.

- [ ] **Step 3: Add nullable media metadata and signed-upload service**

```prisma
model ProductMedia {
  id        String  @id @default(cuid())
  url       String
  altText   String
  sortOrder Int     @default(0)
  width     Int?
  height    Int?
  purpose   String?
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
}
```

Authorize only JPEG, PNG, and WebP variants at or below two MiB with positive bounded dimensions. Use random staging paths, a short expiry, no upsert, and server-key calls only in the API.

- [ ] **Step 4: Implement finalization and compensation**

Fetch staged bytes through authenticated Storage access, verify signature/dimensions/size, copy to random immutable final paths, create all media rows transactionally, remove created final objects on failure, and log but do not overturn success when staging deletion alone fails.

- [ ] **Step 5: Preserve SQLite compatibility**

The existing `imageDataUrl` request remains valid only when `QLEAVES_DATABASE_PROVIDER=sqlite`; PostgreSQL rejects it with a clear validation error and requires staged variants.

- [ ] **Step 6: Verify API and schema tests**

Run: `npm run prisma:generate -w @qleaves/api && npm test -w @qleaves/api`
Expected: all API tests pass, including legacy Storage tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/src/modules/admin apps/api/tests
git commit -m "feat: add signed product image uploads"
```

### Task 5: Browser image optimization and responsive rendering

**Files:**
- Create: `apps/web/src/features/admin/product-image-variants.ts`
- Create: `apps/web/src/features/admin/product-image-variants.test.ts`
- Modify: `apps/web/src/features/admin/admin-api.ts`
- Modify: `apps/web/src/features/admin/AdminProductsPage.tsx`
- Modify: `apps/web/src/features/admin/AdminProductsPage.test.tsx`
- Modify: `apps/web/src/features/catalog/product-types.ts`
- Create: `apps/web/src/components/ProductImage.tsx`
- Create: `apps/web/src/components/ProductImage.test.tsx`
- Modify: `apps/web/src/features/catalog/CatalogPage.tsx`
- Modify: `apps/web/src/features/catalog/ProductPage.tsx`

**Interfaces:**
- Produces: `createProductImageVariants(file): Promise<ProductImageVariant[]>` and `<ProductImage media fallback alt sizes loading />`.
- Consumes: JPEG/PNG/WebP files and API media records with optional purpose/dimensions.

- [ ] **Step 1: Write failing variant and rendering tests**

```ts
it("does not enlarge a small source", async () => {
  const variants = await createProductImageVariants(imageFile(320, 240));
  expect(variants.map((item) => [item.width, item.height])).toEqual([[320, 240], [320, 240]]);
});

it("renders explicit dimensions and responsive sources", () => {
  render(<ProductImage media={responsiveMedia} alt="Monstera" sizes="(max-width: 640px) 100vw, 320px" />);
  expect(screen.getByRole("img")).toHaveAttribute("width", "1400");
  expect(screen.getByRole("img")).toHaveAttribute("height", "1050");
});
```

- [ ] **Step 2: Run focused web tests and confirm RED**

Run: `npm test -w @qleaves/web -- src/features/admin/product-image-variants.test.ts src/components/ProductImage.test.tsx`
Expected: FAIL because the variant helper and responsive component do not exist.

- [ ] **Step 3: Implement browser WebP variants**

Decode with `createImageBitmap`, compute aspect-preserving dimensions for 640 and 1400 pixel bounds without enlargement, draw to canvas, export WebP blobs at a fixed tested quality, close decoded bitmaps, and reject GIF/unsupported/undecodable input with a user-facing error.

- [ ] **Step 4: Implement direct-upload orchestration**

For each variant: request authorization, upload its Blob with the returned path/token, then submit both staged descriptors in the product-create request. Disable duplicate submissions, show per-stage errors, and reset the form only after server finalization succeeds.

- [ ] **Step 5: Implement backward-compatible responsive images**

Choose `catalog` media for grids and `detail` media for product pages; render a legacy single `<img>` when metadata is absent. Preserve fallback-image behavior and cart snapshots.

- [ ] **Step 6: Verify web regressions and build**

Run: `npm test -w @qleaves/web && npm run typecheck -w @qleaves/web && npm run build -w @qleaves/web`
Expected: all web checks pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat: optimize product image delivery"
```

### Task 6: Dynamic sitemap and SEO integration

**Files:**
- Delete: `apps/web/public/sitemap.xml`
- Create: `apps/api/src/modules/seo/sitemap.service.ts`
- Create: `apps/api/src/modules/seo/sitemap.routes.ts`
- Create: `apps/api/tests/sitemap.test.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: `api/index.ts`
- Modify: `vercel.json`
- Modify: `scripts/verify-vercel-config.mjs`
- Modify: `apps/web/src/features/catalog/ProductPage.test.tsx`

**Interfaces:**
- Produces: `GET /sitemap.xml` with current published products and `application/xml; charset=utf-8`.
- Consumes: published product `{ slug, updatedAt }` records ordered by slug.

- [ ] **Step 1: Write failing sitemap behavior tests**

```ts
it("includes published products, excludes drafts, and escapes XML", async () => {
  const response = await request(app).get("/sitemap.xml");
  expect(response.type).toMatch(/xml/);
  expect(response.text).toContain("/plants/published-plant");
  expect(response.text).not.toContain("draft-plant");
  expect(response.text).toContain("&amp;");
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -w @qleaves/api -- tests/sitemap.test.ts`
Expected: FAIL because Express does not serve `/sitemap.xml`.

- [ ] **Step 3: Implement deterministic safe XML generation**

Select only published slugs/updated timestamps, XML-escape every dynamic value, emit stable pages and sorted product URLs, set `s-maxage=300, stale-while-revalidate=3600`, and return a controlled `503` XML error if the query fails.

- [ ] **Step 4: Route sitemap before the SPA fallback**

Add a Vercel rewrite from `/sitemap.xml` to `/api/index` before the catch-all and remove the static XML file so no filesystem asset shadows the function.

- [ ] **Step 5: Verify sitemap, SEO, config, and build**

Run: `npm test -w @qleaves/api -- tests/sitemap.test.ts && npm test -w @qleaves/web -- src/features/catalog/ProductPage.test.tsx && npm run verify:vercel-config && npm run build`
Expected: all checks pass and `robots.txt` still names the canonical sitemap URL.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/seo apps/api/src/routes.ts apps/api/tests/sitemap.test.ts api/index.ts apps/web/public/sitemap.xml apps/web/src/features/catalog/ProductPage.test.tsx vercel.json scripts/verify-vercel-config.mjs
git commit -m "feat: generate the product sitemap dynamically"
```

### Task 7: Production validation, documentation, and final audit

**Files:**
- Modify: `.env.example`
- Modify: `scripts/verify-vercel-env.mjs`
- Modify: `apps/api/tests/production-workflow.test.ts`
- Modify: `docs/deployment/vercel-supabase.md`
- Modify: `docs/deployment/product-image-storage.md`
- Create: `docs/deployment/production-hardening.md`

**Interfaces:**
- Produces: a deterministic production validation contract and operator runbook.
- Consumes: all runtime variables and routes introduced by Tasks 1–6.

- [ ] **Step 1: Write failing production validation tests**

```ts
it("rejects production without a strong rate-limit salt", async () => {
  const result = await runDeploymentEnvironment({ ...validEnvironment, RATE_LIMIT_SALT: "short" });
  expect(result).toMatchObject({ status: 1, stderr: expect.stringContaining("RATE_LIMIT_SALT") });
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm test -w @qleaves/api -- tests/production-workflow.test.ts`
Expected: FAIL because the verifier does not yet require or validate `RATE_LIMIT_SALT`.

- [ ] **Step 3: Implement safe environment validation**

Require a salt of at least 32 characters, reject placeholder values, and reject any server-only key mirrored under a `VITE_` name. Error output names variables only and never prints values.

- [ ] **Step 4: Write exact deployment and rollback procedures**

Document schema generation/validation/deployment, bucket restrictions, direct-upload verification, CSP report review, request-ID log correlation, health/ready/products/sitemap smoke checks, and rollback per isolated commit. Explicitly state that backups remain operator-deferred and are not provided by this release.

- [ ] **Step 5: Run the complete release gate**

```bash
git diff --check
npm run prisma:generate -w @qleaves/api
npm run supabase:validate
npm test
npm run typecheck
npm run build
npm run verify:vercel-config
```

Expected: every command exits zero; API reports 0 failures; web reports 0 failures; build completes; changed files contain no credential-like values.

- [ ] **Step 6: Review schema safety and complete diff**

Run: `git diff 07b8448...HEAD --check && git diff --stat 07b8448...HEAD && git status --short --branch`
Expected: only planned files changed, no `.env`, database, generated client, build output, or dependency directory is tracked.

- [ ] **Step 7: Commit**

```bash
git add .env.example scripts/verify-vercel-env.mjs apps/api/tests/production-workflow.test.ts docs/deployment
git commit -m "docs: finalize production hardening runbook"
```
