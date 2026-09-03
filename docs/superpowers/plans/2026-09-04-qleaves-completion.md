# QLeaves Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Finish the local QLeaves commerce demo using the supplied HTML as an exact visual reference and remove all AR/model functionality.

**Architecture:** Continue the existing React/Vite and Express/Prisma workspace on `feature/qleaves-storefront`. Preserve completed foundation/catalogue API work, replace the public visual layer with the exact reference, then complete cart, orders, authentication, administration, and end-to-end verification.

**Tech Stack:** React, Vite, TypeScript, Anime.js, Three.js (decorative particles only), TanStack Query, Zustand, Express, Prisma, SQLite/PostgreSQL, Zod, Vitest, Testing Library, Supertest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-exact-reference-no-ar-amendment.md`

## Global Constraints

- `qleavessitedesign.html` and its recorded SHA-256 are the visual source of truth; do not redesign or make discretionary visual changes.
- Remove every checked-out AR, GLB, USDZ, `<model-viewer>`, and product-model feature from code, schemas, tests, copy, dependencies, and active documentation.
- Keep Three.js only for the exact decorative hero particle field from the reference.
- Preserve user work at commit `d33046f`; replace visual code only where the new instruction requires it.
- The demo runs through `npm install`, `npm run setup`, and `npm run dev` at ports 5173/3000.
- Cart and checkout are guest-only; payment is COD or an external payment link and never collected onsite.
- Prices and inventory are authoritative on the server.

---

### Task 1: Remove AR Domain and Stabilize Baseline

**Files:** Prisma schemas/migration/seed, product API schemas/service/tests, `content/en.ts`, active design/plan docs, API test configuration.

**Interfaces:** Public products no longer expose `arAsset`; database has no `ArAsset`; seed creates six normal products; API tests run without cross-file database races.

- [ ] Write failing assertions that product JSON and active schemas contain no AR/model fields and that parallel API test execution is isolated.
- [ ] Run focused tests and capture the expected failures.
- [ ] Remove AR persistence/API/copy/docs and add a forward migration that drops `ArAsset` without rewriting prior migration history.
- [ ] Make database tests deterministic under the configured Vitest execution model.
- [ ] Run setup twice, API tests, typecheck, and build; commit.

### Task 2: Exact Reference Frontend Port

**Files:** `HomePage.tsx`, reference-aligned section components, `home.css`, `tokens.css`, `global.css`, header/footer/layout, motion hook, frontend dependencies and tests.

**Interfaces:** The React homepage preserves reference section IDs `hero`, `ripWrap`, `ripSticky`, `plants`, `philosophy`, and `about`; `useReferenceMotion` owns cleanup for counter, particle canvas, rip scrubbing, and card reveal.

- [ ] Add structural tests for exact section order/classes and reduced-motion fallback.
- [ ] Capture failing tests against the current frontend.
- [ ] Port the reference markup/CSS/animations exactly, using React lifecycle cleanup and API-backed plant records without changing visual measurements.
- [ ] Replace Undergrowth copy with QLeaves and dollar prices with QAR while preserving typography and geometry.
- [ ] Run frontend tests, typecheck, build, and visual desktop/mobile comparison; commit.

### Task 3: Complete API-backed Catalogue and Product Detail

**Files:** catalogue API client/types/pages/tests and reference-aligned catalogue/product CSS.

**Interfaces:** Search/filter URL state maps to the public API; product detail adds items to the shared cart; no AR/model interface exists.

- [ ] Add failing tests for search debounce, filter URL state, API errors, product detail, and add-to-cart.
- [ ] Replace hard-coded pagination/filter discovery and incomplete loading/error behavior.
- [ ] Reuse the reference plant-card grammar exactly for catalogue results and its paper/moss typography for product details.
- [ ] Run focused/full web tests, typecheck, and build; commit.

### Task 4: Persistent Guest Cart and Transactional Checkout

**Files:** Zustand cart domain/UI/tests; Express order schemas/service/routes/tests; checkout API/form/confirmation/tests.

**Interfaces:** Cart key `qleaves-cart-v1`; `POST /api/v1/orders` accepts product IDs/quantities plus Qatar guest details and `COD|PAYMENT_LINK`; success clears cart and returns `QL-YYYYMMDD-XXXXXX`.

- [ ] Add failing cart persistence/stock tests and authoritative-price/order transaction tests.
- [ ] Implement cart, validation, transaction, stock decrement, order snapshot, failure recovery, and confirmation.
- [ ] Style only with reference tokens/component grammar.
- [ ] Run API/web tests, setup, typecheck, and build; commit.

### Task 5: Secure Admin and Management

**Files:** auth/session middleware/routes/tests; admin guard/API/layout/product/inventory/order pages/tests.

**Interfaces:** HTTP-only `qleaves_admin` session; protected admin CRUD; explicit order transition allowlist; development login remains `admin@qleaves.local` / `QLeavesDemo123!`.

- [ ] Add failing auth, authorization, CRUD, inventory, and order-transition tests.
- [ ] Implement bounded Argon2 sessions, rate-limited login, guarded routes, product/inventory management, and order management.
- [ ] Use the reference typography/paper/moss system without inventing new visual effects.
- [ ] Run focused/full tests, typecheck, and build; commit.

### Task 6: Local End-to-End Verification and Documentation

**Files:** Playwright configuration/specs, README, environment example, any integration fixes.

**Interfaces:** Independent customer and admin E2E flows; exact local startup commands and URLs documented; no AR verification or model setup.

- [ ] Add customer COD/payment-link, checkout failure-recovery, admin login/order progression, and reduced-motion E2E paths.
- [ ] Run setup twice, all unit/integration tests, typecheck, build, and E2E.
- [ ] Compare desktop and mobile screenshots to `qleavessitedesign.html`; fix only visual deviations.
- [ ] Search checked-out code/docs for banned AR/model terms and resolve every functional reference.
- [ ] Document local startup, credentials, database reset, tests, and production configuration; commit.

## Final Gate

Run `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. The final review must explicitly inspect the reference parity, absence of AR/model functionality, and the deferred findings already recorded in the previous SDD ledger.
