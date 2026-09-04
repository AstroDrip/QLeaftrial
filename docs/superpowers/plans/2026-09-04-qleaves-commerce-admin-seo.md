# QLeaves Commerce, Admin, and SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete password-only administration, live price/stock editing, persistent cart actions, AR removal, footer updates, and production-ready on-site SEO without changing the binding reference design.

**Architecture:** Extend the existing Express/Prisma boundary with session and admin-product modules, keep public catalogue reads server-authoritative, and connect React through TanStack Query and one persisted Zustand cart store. Route metadata is managed by a focused SEO component; the homepage animation hook and reference HTML remain unchanged.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Zustand 5, Express 5, Prisma 6, SQLite/PostgreSQL, Zod 3, Argon2, Vitest, Testing Library, Supertest, Anime.js 3.2.1, Three.js 0.128.0.

**Spec:** `docs/superpowers/specs/2026-09-04-qleaves-commerce-admin-seo-design.md`

## Global Constraints

- Work directly on `qleaves-reference-redesign`; do not create another branch or worktree.
- Do not commit. Present the complete working-tree diff for user review.
- Preserve `qleavessitedesign.html` byte-for-byte as the binding visual reference.
- Keep Anime.js 3.2.1 behavior and Three.js 0.128.0 decorative particles unchanged.
- Keep checkout and order-confirmation behavior unchanged.
- Use `https://qleaves.qa` for canonical and sitemap URLs.
- Keep `taimuomar` exclusively in backend seed/test code.
- Do not implement external SEO or operational services.

---

### Task 1: Remove the obsolete AR persistence domain

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/schema.postgresql.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Create: `apps/api/prisma/migrations/20260904_remove_ar_domain/migration.sql`
- Modify: `apps/api/tests/schema-parity.test.ts`
- Modify: `apps/api/tests/seed.test.ts`
- Modify: `apps/api/tests/products.test.ts`

**Interfaces:**
- Produces: Product records with no `arEnabled` relation/field and seed data with no model metadata.
- Preserves: the initial migration as historical evidence.

- [ ] Add API tests that inspect generated behavior and seeded records without expecting any AR/model properties.
- [ ] Run the focused tests and confirm they fail because the current schema/seed still contains the obsolete domain.
- [ ] Remove AR fields/models from both active schemas and seed logic.
- [ ] Add a forward SQLite table-rebuild migration that copies all retained Product columns, drops `ArAsset`, restores indexes and foreign-key safety, and leaves the initial migration unchanged.
- [ ] Generate both Prisma clients and rerun focused tests until green.

### Task 2: Implement password-only session authentication

**Files:**
- Create: `apps/api/src/modules/auth/auth.schemas.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.middleware.ts`
- Create: `apps/api/src/modules/auth/auth.routes.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/tests/helpers.ts`
- Create: `apps/api/tests/auth.test.ts`

**Interfaces:**
- Consumes: `AdminUser.passwordHash`, `Session.tokenHash`, and Express request/response.
- Produces: `POST /api/v1/auth/login { password }`, `GET /api/v1/auth/session`, `POST /api/v1/auth/logout`, and `requireAdmin`.

- [ ] Write Supertest cases proving password-only login succeeds, email is unnecessary, wrong passwords return 401, protected session lookup succeeds with the cookie, logout invalidates it, and the password never appears in a response.
- [ ] Run `npm test -w @qleaves/api -- auth.test.ts` and confirm the routes are missing.
- [ ] Implement Zod input validation, Argon2 verification, cryptographically random bearer generation, SHA-256 token storage, seven-day expiration, HTTP-only SameSite=Lax cookies, and production Secure cookies.
- [ ] Change the development seed hash to `taimuomar` and update backend test helpers.
- [ ] Rerun auth and seed tests until green.

### Task 3: Add protected product inventory writes

**Files:**
- Create: `apps/api/src/modules/admin/admin-product.schemas.ts`
- Create: `apps/api/src/modules/admin/admin-product.service.ts`
- Create: `apps/api/src/modules/admin/admin-product.routes.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/api/src/modules/products/product.schemas.ts`
- Modify: `apps/api/src/modules/products/product.service.ts`
- Create: `apps/api/tests/admin-products.test.ts`
- Modify: `apps/api/tests/products.test.ts`

**Interfaces:**
- Produces: protected `GET /api/v1/admin/products` and `PATCH /api/v1/admin/products/:id { priceQar?, stock? }`.
- Changes: public `ProductSummary.stock: number`; `inStock` remains derived as `stock > 0`.

- [ ] Write integration tests for unauthorized rejection, product listing, integer/non-negative validation, immediate database writes, inventory upsert, and updated public GET output.
- [ ] Run focused tests and confirm the admin routes and public stock field are absent.
- [ ] Implement protected list/update routes, Zod schemas with at least one patch field, and a Prisma transaction covering Product and Inventory.
- [ ] Set protected responses to `Cache-Control: no-store` and public product responses to revalidate.
- [ ] Rerun admin/public product tests until green.

### Task 4: Implement and integrate the real cart store

**Files:**
- Create: `apps/web/src/features/cart/cart-store.ts`
- Create: `apps/web/src/features/cart/cart-store.test.ts`
- Modify: `apps/web/src/features/cart/CartPage.tsx`
- Modify: `apps/web/src/features/catalog/CatalogPage.tsx`
- Modify: `apps/web/src/features/catalog/ProductPage.tsx`
- Modify: `apps/web/src/features/home/HomePage.tsx`
- Modify: `apps/web/src/features/home/home.css`
- Modify: `apps/web/src/features/catalog/catalog.css`
- Modify: `apps/web/src/features/catalog/product-detail.css`
- Modify: `apps/web/src/features/catalog/product-types.ts`
- Modify: relevant web component tests.

**Interfaces:**
- Produces: persisted `useCartStore` with `addItem(product)`, `setQuantity(id, quantity)`, `removeItem(id)`, and `clear()`.
- Consumes: public API product `stock`, `priceQar`, and image data.

- [ ] Write store tests that prove add/merge, stock clamping, removal, totals, and persistence-safe state shape.
- [ ] Run the focused store test and confirm the module is missing.
- [ ] Implement the minimal Zustand persisted store and replace CartPage's hard-coded local state.
- [ ] Write component tests proving in-stock homepage/catalogue/product controls add the selected API product and out-of-stock controls are disabled.
- [ ] Run tests and confirm the controls are absent.
- [ ] Make HomePage query public products while retaining the exact section markup/classes and animation IDs; add understated controls without altering animation timing.
- [ ] Add catalogue and product-detail controls, accessible live feedback, lazy image loading, asynchronous decoding, and query invalidation-compatible product types.
- [ ] Rerun focused web tests until green.

### Task 5: Connect the admin UI to authentication and auto-saving products

**Files:**
- Create: `apps/web/src/features/admin/admin-api.ts`
- Create: `apps/web/src/features/admin/AdminLoginPage.test.tsx`
- Create: `apps/web/src/features/admin/AdminProductsPage.test.tsx`
- Modify: `apps/web/src/features/admin/AdminLoginPage.tsx`
- Modify: `apps/web/src/features/admin/AdminProductsPage.tsx`
- Modify: `apps/web/src/features/admin/AdminLayout.tsx`
- Modify: `apps/web/src/content/en.ts`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: password-only auth endpoints and protected admin product endpoints with cookie credentials.
- Produces: password-only login UI, authenticated route gate/logout, and debounced integer price/stock auto-save.

- [ ] Write UI tests proving there is no email control, login sends only the password, invalid login stays on the page, protected layout redirects when unauthenticated, and logout calls the backend.
- [ ] Run tests and confirm the current static navigation behavior fails them.
- [ ] Implement the auth API, login mutation, session query, route gate, and logout while keeping the existing admin visual structure.
- [ ] Write UI tests proving admin rows come from the API, integer edits auto-save, blur flushes pending changes, errors remain visible, and successful writes invalidate `products`, `product`, and `catalog-filters` queries.
- [ ] Run tests and confirm the static product rows fail them.
- [ ] Implement controlled numeric inputs with a short debounce and mutation status, then rerun focused tests until green.

### Task 6: Update the footer and implement on-site SEO

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/components/Footer.tsx`
- Modify: `apps/web/src/components/NotFoundPage.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/app/providers.tsx`
- Create: `apps/web/src/seo/Seo.tsx`
- Create: `apps/web/src/seo/Seo.test.tsx`
- Create: `apps/web/src/seo/site.ts`
- Create: `apps/web/public/robots.txt`
- Create: `apps/web/public/sitemap.xml`
- Modify: `apps/web/src/components/Layout.test.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Produces: route metadata rooted at `https://qleaves.qa`, Product/Offer JSON-LD, Organization/LocalBusiness/WebSite JSON-LD, and 404 noindex.
- Preserves: homepage animation source and reference geometry.

- [ ] Write footer tests for centered vertical semantic order, “Founded in 2020,” accessible Instagram/WhatsApp links, and final QOZYD credit.
- [ ] Run the test and confirm text links/current layout fail.
- [ ] Implement inline accessible icons and exact requested links; update only footer styles.
- [ ] Write SEO tests for canonical/description/OG updates, product structured data, and 404 noindex.
- [ ] Run the focused test and confirm no metadata manager exists.
- [ ] Add robust head-tag ownership/cleanup, default static metadata, public files, route metadata, and React lazy route chunks with a neutral accessible loading fallback.
- [ ] Configure conservative QueryClient defaults and image attributes without changing the reference animation code.
- [ ] Rerun web tests until green.

### Task 7: Full verification and review handoff

**Files:**
- Review: all changed files
- Preserve unchanged: `qleavessitedesign.html`

**Interfaces:**
- Produces: a reviewable, uncommitted working tree.

- [ ] Run `npm run prisma:generate -w @qleaves/api`.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Search active source for `arEnabled|ArAsset|arAsset|glbUrl|usdzUrl|model-viewer` and confirm only the historical initial migration or explicitly archived documentation may mention obsolete terms.
- [ ] Verify `git diff -- qleavessitedesign.html` is empty.
- [ ] Review `git diff --check`, `git status --short`, and the complete diff; report exact verification counts and any Graphify health warning.
- [ ] Do not commit; wait for user review.

