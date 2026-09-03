# QLeaves Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally runnable Qatar plant storefront with an olive editorial homepage, catalogue, Google `<model-viewer>` AR demo, guest cart and checkout, and a secured administration area.

**Architecture:** Use an npm-workspaces monorepo containing a Vite React client and an Express API. Prisma provides a SQLite development database and PostgreSQL production schema compatibility; the client consumes a versioned REST API, while local static media is served by Express. Keep motion isolated from commerce logic and keep all price and stock decisions authoritative on the server.

**Tech Stack:** Node.js 24, TypeScript, npm workspaces, React, Vite, React Router, TanStack Query, Zustand, GSAP ScrollTrigger, Google `<model-viewer>`, Express, Prisma, SQLite/PostgreSQL, Zod, Vitest, Testing Library, Supertest, and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-qleaves-storefront-design.md`

## Global Constraints

- The complete demo must run without a cloud account through `npm install`, `npm run setup`, and `npm run dev`.
- Default URLs are storefront `http://localhost:5173`, API `http://localhost:3000/api/v1`, and admin `http://localhost:5173/admin`.
- The initial interface is English, but customer-facing copy must be centralized for later localization.
- The website does not collect payments; checkout offers `COD` or `PAYMENT_LINK` only.
- Customers use guest checkout only; admin authentication uses a secure HTTP-only session cookie.
- The API recalculates price and checks inventory transactionally when creating an order.
- The supplied `C:\Users\HP\Downloads\house_plant.glb` is a demo asset and must retain attribution to Lahcen.el under CC BY 4.0.
- AR assets load only on product detail pages and have explicit loading, unsupported, and failure states.
- Homepage motion must respect `prefers-reduced-motion`; purchasing never depends on animation.
- Product variants, finalized delivery fees, live notifications, automated payment-link delivery, and on-site payment processing are out of scope.

---

## File Map

```text
qleaves/
  package.json                         # workspace scripts and toolchain entry points
  .env.example                        # documented local environment
  README.md                           # setup, credentials, URLs, and verification
  apps/
    api/
      package.json                    # API scripts and dependencies
      tsconfig.json
      prisma/
        schema.prisma                 # development SQLite database model
        seed.ts                       # deterministic plants and admin seed
      src/
        app.ts                        # Express composition
        server.ts                     # process startup only
        config.ts                     # validated environment
        lib/prisma.ts                 # Prisma singleton
        middleware/error-handler.ts   # consistent API failures
        middleware/require-admin.ts   # session protection
        modules/auth/                  # admin login/session/logout
        modules/products/              # public queries and admin CRUD
        modules/orders/                # validated transactional checkout/admin status
        routes.ts                     # `/api/v1` router
      tests/                           # Supertest module and integration tests
    web/
      package.json                    # client scripts and dependencies
      vite.config.ts
      src/
        app/                           # router, providers, route shell
        components/                   # focused shared UI
        features/home/                 # editorial homepage and GSAP choreography
        features/catalog/              # queries, filters, cards, details
        features/ar/                   # model-viewer wrapper and states
        features/cart/                 # Zustand cart and drawer/page
        features/checkout/             # guest checkout and confirmation
        features/admin/                # login, products, inventory, orders
        lib/api.ts                     # typed fetch boundary
        content/en.ts                  # centralized customer-facing copy
        styles/                        # tokens, global rules, component styles
        test/                           # browser mocks and test setup
      e2e/                             # Playwright customer/admin paths
  public/
    models/house-plant.glb             # attributed demo model copied from supplied file
    images/                            # optimized local demo imagery
```

---

### Task 1: Runnable Workspace and Health Check

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/tests/health.test.ts`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/App.tsx`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/app/App.test.tsx`

**Interfaces:**
- Produces: root scripts `setup`, `dev`, `test`, `typecheck`, and `build`.
- Produces: `createApp(): Express` and `GET /api/v1/health -> { status: "ok" }`.
- Produces: Vite proxy from `/api` to `http://localhost:3000`.

- [ ] **Step 1: Write failing API and client smoke tests**

```ts
// apps/api/tests/health.test.ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("GET /api/v1/health", () => {
  it("reports that the API is ready", async () => {
    const response = await request(createApp()).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

// apps/web/src/app/App.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the QLeaves landmark", () => {
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByText("QLeaves")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the smoke tests and verify they fail**

Run: `npm test`

Expected: FAIL because workspace packages and application modules do not exist yet.

- [ ] **Step 3: Create the workspace manifests and minimal applications**

Use root workspaces `apps/*`. Root `npm run dev` must run API and web together with `concurrently`; `npm run setup` must run Prisma generation, migration, and seed through the API workspace. Configure Vitest with `jsdom` for web and `node` for API. Implement:

```ts
// apps/api/src/app.ts
import express from "express";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get("/api/v1/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  return app;
}
```

```tsx
// apps/web/src/app/App.tsx
export function App() {
  return <main><h1>QLeaves</h1></main>;
}
```

- [ ] **Step 4: Install and verify the workspace**

Run: `npm install`

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all smoke tests pass, both projects typecheck, and both production builds succeed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example apps
git commit -m "chore: scaffold QLeaves workspace"
```

---

### Task 2: Database Schema and Deterministic Seed

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/src/lib/prisma.ts`
- Create: `apps/api/tests/helpers.ts`
- Create: `apps/api/tests/seed.test.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces: Prisma models `AdminUser`, `Session`, `Product`, `ProductMedia`, `ArAsset`, `Inventory`, `Order`, and `OrderItem`.
- Produces: enums `PaymentMethod`, `PaymentStatus`, and `OrderStatus`.
- Produces: `seedDatabase(): Promise<void>`.
- Produces test helpers `resetDatabase()`, `seededProduct(slug)`, `inventoryFor(productId)`, `validOrder(overrides)`, and `loggedInAgent()` for later API contract tests.
- Product prices are integer QAR dirhams for the demo; no floating-point currency values.

- [ ] **Step 1: Write the failing seed test**

```ts
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { seedDatabase } from "../prisma/seed";

describe("seedDatabase", () => {
  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.adminUser.deleteMany();
  });
  afterAll(() => prisma.$disconnect());

  it("creates an AR-enabled plant and development admin", async () => {
    await seedDatabase();
    expect(await prisma.product.count()).toBeGreaterThanOrEqual(6);
    expect(await prisma.product.findFirst({ where: { slug: "house-plant" } }))
      .toMatchObject({ arEnabled: true, priceQar: 180 });
    expect(await prisma.adminUser.findUnique({ where: { email: "admin@qleaves.local" } }))
      .not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify schema symbols are missing**

Run: `npm run test -w @qleaves/api -- seed.test.ts`

Expected: FAIL because Prisma client, schema, and seed module are absent.

- [ ] **Step 3: Define the schema and seed**

Define unique product `slug` and `sku`; one-to-one `Inventory`; ordered `ProductMedia`; optional one-to-one `ArAsset`; immutable order-item `productName`, `sku`, and `unitPriceQar` snapshots; unique human-readable `orderNumber`; nullable `paymentUrl`; timestamps on all mutable records. Seed six plants, one house plant linked to `/media/models/house-plant.glb`, and a development admin whose password hash is generated from `QLeavesDemo123!` with `argon2`.

- [ ] **Step 4: Generate, migrate, seed, and rerun the test**

Run: `npm run setup`

Run: `npm run test -w @qleaves/api -- seed.test.ts`

Expected: PASS, and rerunning `npm run setup` remains idempotent.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/src/lib apps/api/tests/seed.test.ts apps/api/package.json package.json
git commit -m "feat: add local product and order database"
```

---

### Task 3: Product Catalogue API

**Files:**
- Create: `apps/api/src/modules/products/product.schemas.ts`
- Create: `apps/api/src/modules/products/product.service.ts`
- Create: `apps/api/src/modules/products/product.routes.ts`
- Create: `apps/api/src/routes.ts`
- Create: `apps/api/src/middleware/error-handler.ts`
- Create: `apps/api/tests/products.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `ProductSummary`, `ProductDetail`, and `ProductQuery` types.
- Produces: `GET /api/v1/products?q=&category=&light=&page=`.
- Produces: `GET /api/v1/products/:slug` returning 404 `{ error: { code, message } }` when absent.
- Product detail returns `arAsset: null | { glbUrl: string; usdzUrl: string | null; attribution: string }`.

- [ ] **Step 1: Write failing catalogue contract tests**

```ts
it("filters published products and excludes admin-only fields", async () => {
  const response = await request(createApp()).get("/api/v1/products?q=house");
  expect(response.status).toBe(200);
  expect(response.body.items[0]).toEqual(expect.objectContaining({
    slug: "house-plant", priceQar: 180, inStock: true,
  }));
  expect(response.body.items[0]).not.toHaveProperty("costPrice");
});

it("returns AR metadata for a product detail", async () => {
  const response = await request(createApp()).get("/api/v1/products/house-plant");
  expect(response.body.arAsset.glbUrl).toBe("/media/models/house-plant.glb");
  expect(response.body.arAsset.attribution).toContain("Lahcen.el");
});
```

- [ ] **Step 2: Run tests and confirm 404 failures**

Run: `npm run test -w @qleaves/api -- products.test.ts`

Expected: FAIL because product routes are not mounted.

- [ ] **Step 3: Implement validated query and detail services**

Parse query strings through Zod, cap page size at 24, select published records only, and map Prisma records to explicit response DTOs. Mount all module routers beneath `/api/v1`. Implement a typed `ApiError` and final error middleware that does not expose stack traces.

- [ ] **Step 4: Run module and full API tests**

Run: `npm run test -w @qleaves/api -- products.test.ts`

Run: `npm run test -w @qleaves/api`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/tests/products.test.ts
git commit -m "feat: expose public plant catalogue API"
```

---

### Task 4: Olive Design System and Application Shell

**Files:**
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/global.css`
- Create: `apps/web/src/content/en.ts`
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/AppProviders.tsx`
- Create: `apps/web/src/components/SiteHeader.tsx`
- Create: `apps/web/src/components/SiteFooter.tsx`
- Create: `apps/web/src/components/Layout.tsx`
- Create: `apps/web/src/components/Layout.test.tsx`
- Create: `apps/web/src/test/render.tsx`
- Create: `apps/web/src/test/fixtures.ts`
- Create: `apps/web/src/test/server.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/app/App.tsx`

**Interfaces:**
- Produces: CSS custom properties `--olive-deep`, `--olive-forest`, `--moss`, `--sage`, `--ivory`, `--sand`, and `--terracotta` with spec values.
- Produces: the route shell, real `/` route, and catch-all not-found route; feature tasks register `/shop`, `/plants/:slug`, `/cart`, `/checkout`, `/order/:orderNumber`, and `/admin/*` when their screens are implemented.
- Produces: `copy` object as the only source of customer-facing navigation and commerce labels.
- Produces: `renderWithProviders(ui, options?)`, MSW `server`, and typed `housePlant` and `housePlantCartItem` fixtures for later client tests.

- [ ] **Step 1: Write failing shell accessibility test**

```tsx
it("provides navigation, skip link, and cart destination", () => {
  render(<MemoryRouter><Layout><p>Page</p></Layout></MemoryRouter>);
  expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute("href", "#main-content");
  expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /cart/i })).toHaveAttribute("href", "/cart");
});
```

- [ ] **Step 2: Run the test and verify missing shell components**

Run: `npm run test -w @qleaves/web -- Layout.test.tsx`

Expected: FAIL because the layout does not exist.

- [ ] **Step 3: Implement tokens, typography fallback, providers, and routes**

Use DM Mono for metadata and a licensed/open geometric display fallback declared through CSS variables. Use fluid `clamp()` typography, visible focus rings, 44px minimum touch targets, and a centered maximum content width. Configure TanStack Query and React Router. At this task boundary, mount the real `HomePage` route and an explicit `NotFoundPage`; later tasks add their routes only when their functional screens exist.

- [ ] **Step 4: Test shell and build**

Run: `npm run test -w @qleaves/web -- Layout.test.tsx`

Run: `npm run build -w @qleaves/web`

Expected: PASS with no TypeScript or CSS import errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat: add QLeaves design system and shell"
```

---

### Task 5: Scroll-Driven Editorial Homepage

**Files:**
- Create: `apps/web/src/features/home/HomePage.tsx`
- Create: `apps/web/src/features/home/HeroSequence.tsx`
- Create: `apps/web/src/features/home/FeaturedPlantStories.tsx`
- Create: `apps/web/src/features/home/useHeroMotion.ts`
- Create: `apps/web/src/features/home/home.css`
- Create: `apps/web/src/features/home/HomePage.test.tsx`
- Create: `apps/web/public/images/hero/README.md`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Produces: homepage sections `hero`, `assembled-plant`, `featured-plants`, `ar-intro`, and `shop-cta`.
- Produces: `useHeroMotion(root: RefObject<HTMLElement>): void`, scoped with `gsap.context()` and reverted on unmount.
- Consumes: `window.matchMedia("(prefers-reduced-motion: reduce)")`.

- [ ] **Step 1: Write failing semantic and reduced-motion tests**

```tsx
it("renders the editorial path without requiring motion", () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  render(<MemoryRouter><HomePage /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: /plants change a room/i })).toBeVisible();
  expect(screen.getByRole("link", { name: /shop plants/i })).toHaveAttribute("href", "/shop");
  expect(document.documentElement).toHaveAttribute("data-motion", "reduced");
});
```

- [ ] **Step 2: Run the test and verify the homepage is absent**

Run: `npm run test -w @qleaves/web -- HomePage.test.tsx`

Expected: FAIL because `HomePage` and `mockReducedMotion` integration do not exist.

- [ ] **Step 3: Implement original QLeaves choreography**

Create an oversized QLeaves wordmark, staggered headline reveal, floating image fragments that converge during a pinned scroll section, featured plant panels, and an AR transition. Use GSAP ScrollTrigger only inside `useHeroMotion`; use transforms and opacity, not layout properties. Under reduced motion, do not create ScrollTriggers and render every section in its complete static state. Keep all copy original and all visuals botanical.

- [ ] **Step 4: Verify motion lifecycle and responsive build**

Run: `npm run test -w @qleaves/web -- HomePage.test.tsx`

Add an assertion that unmounting kills the scoped ScrollTriggers, then rerun. Run: `npm run build -w @qleaves/web`.

Expected: tests and build pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/home apps/web/public/images/hero apps/web/src/app/router.tsx
git commit -m "feat: build editorial olive homepage"
```

---

### Task 6: Catalogue and Product Detail

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/features/catalog/types.ts`
- Create: `apps/web/src/features/catalog/catalog.api.ts`
- Create: `apps/web/src/features/catalog/CatalogPage.tsx`
- Create: `apps/web/src/features/catalog/CatalogFilters.tsx`
- Create: `apps/web/src/features/catalog/ProductCard.tsx`
- Create: `apps/web/src/features/catalog/ProductPage.tsx`
- Create: `apps/web/src/features/catalog/catalog.css`
- Create: `apps/web/src/features/catalog/CatalogPage.test.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Produces: `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` throwing `ApiClientError` with `status`, `code`, and `message`.
- Produces: `getProducts(query: ProductQuery)` and `getProduct(slug: string)`.
- Consumes: Task 3 `ProductSummary` and `ProductDetail` JSON shapes.

- [ ] **Step 1: Write failing catalogue interaction test**

```tsx
it("filters plants and links to product details", async () => {
  server.use(http.get("/api/v1/products", ({ request }) => {
    expect(new URL(request.url).searchParams.get("q")).toBe("house");
    return HttpResponse.json({ items: [housePlant], page: 1, total: 1 });
  }));
  renderWithProviders(<CatalogPage />);
  await userEvent.type(screen.getByRole("searchbox", { name: /search plants/i }), "house");
  expect(await screen.findByRole("link", { name: /view house plant/i })).toHaveAttribute("href", "/plants/house-plant");
});
```

- [ ] **Step 2: Run the test and confirm missing modules**

Run: `npm run test -w @qleaves/web -- CatalogPage.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement query-backed catalogue and details**

Debounce text search by 250ms, synchronize filters to URL search parameters, show skeleton/loading, empty, error/retry, and out-of-stock states, and keep product cards keyboard navigable. Product details must show name, botanical name, QAR price, stock, care facts, attribution when present, and cart action.

- [ ] **Step 4: Run tests and production build**

Run: `npm run test -w @qleaves/web -- CatalogPage.test.tsx`

Run: `npm run build -w @qleaves/web`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib apps/web/src/features/catalog apps/web/src/app/router.tsx
git commit -m "feat: add plant catalogue and details"
```

---

### Task 7: 3D and AR Demo Asset

**Files:**
- Create: `apps/web/src/features/ar/model-viewer.d.ts`
- Create: `apps/web/src/features/ar/PlantModelViewer.tsx`
- Create: `apps/web/src/features/ar/PlantModelViewer.test.tsx`
- Create: `apps/web/src/features/ar/ar.css`
- Create: `public/models/ATTRIBUTION.md`
- Copy: `C:\Users\HP\Downloads\house_plant.glb` to `public/models/house-plant.glb`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/src/features/catalog/ProductPage.tsx`

**Interfaces:**
- Produces: `PlantModelViewer({ glbUrl, usdzUrl, alt, attribution }: PlantModelViewerProps)`.
- API serves `/media/models/house-plant.glb` from the repository `public/models` directory with immutable cache headers in production.
- `<model-viewer>` attributes: `ar`, `ar-modes="webxr scene-viewer quick-look"`, `ar-placement="floor"`, `camera-controls`, `auto-rotate`, `shadow-intensity="1"`, and `touch-action="pan-y"`.

- [ ] **Step 1: Write failing viewer-state tests**

```tsx
it("renders a lazy AR viewer with attribution", async () => {
  render(<PlantModelViewer glbUrl="/media/models/house-plant.glb" usdzUrl={null} alt="House plant in a pot" attribution="House plant by Lahcen.el, CC BY 4.0" />);
  const viewer = screen.getByLabelText("House plant in a pot");
  expect(viewer).toHaveAttribute("reveal", "interaction");
  expect(viewer).toHaveAttribute("ar-modes", "webxr scene-viewer quick-look");
  expect(screen.getByText(/Lahcen\.el/)).toBeVisible();
});
```

- [ ] **Step 2: Run the test and confirm the custom element wrapper is absent**

Run: `npm run test -w @qleaves/web -- PlantModelViewer.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Copy the model and implement viewer states**

Copy the binary without modifying the source. Add the Sketchfab source URL and CC BY 4.0 attribution to `ATTRIBUTION.md`. Dynamically import `@google/model-viewer`; expose progress text from the `progress` event; expose retry after `error`; show “AR is not supported on this device” only after an `ar-status="failed"` event; omit `ios-src` when no USDZ exists so Quick Look can use generated USDZ.

- [ ] **Step 4: Verify the binary and viewer**

Run: `Get-FileHash -Algorithm SHA256 C:\Users\HP\Downloads\house_plant.glb, .\public\models\house-plant.glb`

Expected: both hashes match.

Run: `npm run test -w @qleaves/web -- PlantModelViewer.test.tsx`

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/models apps/api/src/app.ts apps/web/src/features/ar apps/web/src/features/catalog/ProductPage.tsx
git commit -m "feat: add plant 3D and AR preview"
```

---

### Task 8: Persistent Cart

**Files:**
- Create: `apps/web/src/features/cart/cart.types.ts`
- Create: `apps/web/src/features/cart/cart.store.ts`
- Create: `apps/web/src/features/cart/CartPage.tsx`
- Create: `apps/web/src/features/cart/CartSummary.tsx`
- Create: `apps/web/src/features/cart/cart.css`
- Create: `apps/web/src/features/cart/cart.store.test.ts`
- Modify: `apps/web/src/features/catalog/ProductPage.tsx`
- Modify: `apps/web/src/components/SiteHeader.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Produces: `CartItem { productId, slug, name, unitPriceQar, imageUrl, quantity, availableStock }`.
- Produces: `useCartStore` actions `addItem`, `setQuantity`, `removeItem`, and `clear` plus derived selectors `cartCount` and `cartSubtotalQar`.
- Persists only non-sensitive cart data under localStorage key `qleaves-cart-v1`.

- [ ] **Step 1: Write failing cart-domain tests**

```ts
it("merges quantities without exceeding known stock", () => {
  const store = createCartStore();
  store.getState().addItem({ ...housePlantCartItem, quantity: 2, availableStock: 3 });
  store.getState().addItem({ ...housePlantCartItem, quantity: 2, availableStock: 3 });
  expect(store.getState().items[0].quantity).toBe(3);
  expect(store.getState().subtotalQar()).toBe(540);
});
```

- [ ] **Step 2: Run the test and verify store symbols are missing**

Run: `npm run test -w @qleaves/web -- cart.store.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement cart domain and UI**

Keep calculations in pure functions, clamp quantities between one and known stock, format money as `QAR` through `Intl.NumberFormat("en-QA", { style: "currency", currency: "QAR" })`, announce cart changes through an ARIA live region, and provide an empty-cart route back to `/shop`.

- [ ] **Step 4: Run tests and build**

Run: `npm run test -w @qleaves/web -- cart.store.test.ts`

Run: `npm run build -w @qleaves/web`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/cart apps/web/src/features/catalog/ProductPage.tsx apps/web/src/components/SiteHeader.tsx apps/web/src/app/router.tsx
git commit -m "feat: add persistent guest cart"
```

---

### Task 9: Transactional Guest Order API

**Files:**
- Create: `apps/api/src/modules/orders/order.schemas.ts`
- Create: `apps/api/src/modules/orders/order-number.ts`
- Create: `apps/api/src/modules/orders/order.service.ts`
- Create: `apps/api/src/modules/orders/order.routes.ts`
- Create: `apps/api/tests/orders.test.ts`
- Modify: `apps/api/src/routes.ts`

**Interfaces:**
- Consumes: `CreateOrderInput { customerName, phone, email, addressLine1, area, deliveryNotes?, paymentMethod, items: { productId, quantity }[] }`.
- Produces: `POST /api/v1/orders -> { orderNumber, status, paymentMethod, paymentStatus, subtotalQar, items }` with HTTP 201.
- Produces: conflicts `OUT_OF_STOCK` and validation errors `INVALID_ORDER` through the standard error envelope.

- [ ] **Step 1: Write failing authoritative-price and stock tests**

```ts
it("ignores browser prices and snapshots the database price", async () => {
  const response = await request(createApp()).post("/api/v1/orders").send(validOrder({
    items: [{ productId: housePlant.id, quantity: 2, unitPriceQar: 1 }],
  }));
  expect(response.status).toBe(201);
  expect(response.body.subtotalQar).toBe(360);
});

it("does not create or decrement anything when stock is insufficient", async () => {
  const before = await inventoryFor(housePlant.id);
  const response = await request(createApp()).post("/api/v1/orders").send(validOrder({
    items: [{ productId: housePlant.id, quantity: before.quantity + 1 }],
  }));
  expect(response.status).toBe(409);
  expect(response.body.error.code).toBe("OUT_OF_STOCK");
  expect((await inventoryFor(housePlant.id)).quantity).toBe(before.quantity);
});
```

- [ ] **Step 2: Run tests and confirm missing route**

Run: `npm run test -w @qleaves/api -- orders.test.ts`

Expected: FAIL with 404.

- [ ] **Step 3: Implement Zod validation and Prisma transaction**

Accept Qatar phone strings in international or local form but normalize to a stored string; validate email and nonempty address/area; allow only `COD` and `PAYMENT_LINK`. Inside one transaction, fetch all products and inventories, reject missing/unpublished/out-of-stock items, calculate totals, create immutable order items, and decrement stock. Generate order numbers as `QL-YYYYMMDD-XXXXXX` using cryptographically random uppercase alphanumerics and retry a unique collision twice.

- [ ] **Step 4: Run order and complete API tests**

Run: `npm run test -w @qleaves/api -- orders.test.ts`

Run: `npm run test -w @qleaves/api`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/orders apps/api/src/routes.ts apps/api/tests/orders.test.ts
git commit -m "feat: create validated guest orders"
```

---

### Task 10: Guest Checkout and Confirmation

**Files:**
- Create: `apps/web/src/features/checkout/checkout.schemas.ts`
- Create: `apps/web/src/features/checkout/checkout.api.ts`
- Create: `apps/web/src/features/checkout/CheckoutPage.tsx`
- Create: `apps/web/src/features/checkout/OrderConfirmationPage.tsx`
- Create: `apps/web/src/features/checkout/checkout.css`
- Create: `apps/web/src/features/checkout/CheckoutPage.test.tsx`
- Create: `apps/web/src/features/checkout/checkout.test-helpers.tsx`
- Modify: `apps/web/src/app/router.tsx`
- Modify: `apps/web/src/features/cart/CartPage.tsx`

**Interfaces:**
- Consumes: Task 9 create-order endpoint.
- Produces: React Hook Form schema matching `CreateOrderInput`.
- Produces: route state for `/order/:orderNumber` and clears cart only after HTTP 201.
- Produces test helpers `seedCart(items)`, `readCart()`, `renderCheckout()`, and `completeValidGuestDetails()` used by the checkout contract test.

- [ ] **Step 1: Write failing checkout recovery test**

```tsx
it("keeps the cart when order submission fails", async () => {
  server.use(http.post("/api/v1/orders", () => HttpResponse.json(
    { error: { code: "OUT_OF_STOCK", message: "House Plant is no longer available." } },
    { status: 409 },
  )));
  seedCart([housePlantCartItem]);
  renderCheckout();
  await completeValidGuestDetails();
  await userEvent.click(screen.getByRole("button", { name: /place order/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/no longer available/i);
  expect(readCart()).toHaveLength(1);
});
```

- [ ] **Step 2: Run test and verify checkout modules are missing**

Run: `npm run test -w @qleaves/web -- CheckoutPage.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement accessible guest checkout**

Collect name, phone, email, address line, area, and delivery notes. Render COD and payment-link choices as labelled radios with clear explanations that no payment is collected on the site. Disable duplicate submissions, map field errors next to controls, focus the error summary on failure, navigate on success, and show order number plus payment next steps on confirmation.

- [ ] **Step 4: Run checkout and full client tests**

Run: `npm run test -w @qleaves/web -- CheckoutPage.test.tsx`

Run: `npm run test -w @qleaves/web`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/checkout apps/web/src/features/cart/CartPage.tsx apps/web/src/app/router.tsx
git commit -m "feat: add guest checkout and confirmation"
```

---

### Task 11: Secure Admin Authentication

**Files:**
- Create: `apps/api/src/modules/auth/auth.schemas.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.routes.ts`
- Create: `apps/api/src/middleware/require-admin.ts`
- Create: `apps/api/tests/auth.test.ts`
- Create: `apps/web/src/features/admin/admin.api.ts`
- Create: `apps/web/src/features/admin/AdminLoginPage.tsx`
- Create: `apps/web/src/features/admin/RequireAdmin.tsx`
- Create: `apps/web/src/features/admin/AdminLayout.tsx`
- Create: `apps/web/src/features/admin/AdminLoginPage.test.tsx`
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Produces: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/session`.
- Produces: cookie `qleaves_admin` with `httpOnly`, `sameSite: "strict"`, `secure` in production, and opaque random token whose hash is stored in `Session`.
- Produces: `requireAdmin` middleware attaching `response.locals.admin`.

- [ ] **Step 1: Write failing session-security tests**

```ts
it("creates an HTTP-only admin session and protects admin routes", async () => {
  const agent = request.agent(createApp());
  const login = await agent.post("/api/v1/auth/login").send({
    email: "admin@qleaves.local", password: "QLeavesDemo123!",
  });
  expect(login.headers["set-cookie"][0]).toMatch(/HttpOnly/);
  expect((await agent.get("/api/v1/auth/session")).status).toBe(200);
});
```

- [ ] **Step 2: Run auth tests and confirm routes are absent**

Run: `npm run test -w @qleaves/api -- auth.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement bounded sessions and protected routing**

Verify passwords with argon2, rate-limit login by IP and normalized email, generate 32-byte random tokens, store SHA-256 token hashes, expire sessions after eight hours, and clear both cookie and database session on logout. The client always sends `credentials: "include"`; `RequireAdmin` redirects anonymous users to `/admin/login` without flashing protected content.

- [ ] **Step 4: Run API and client auth tests**

Run: `npm run test -w @qleaves/api -- auth.test.ts`

Run: `npm run test -w @qleaves/web -- AdminLoginPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth apps/api/src/middleware/require-admin.ts apps/api/src/routes.ts apps/api/tests/auth.test.ts apps/web/src/features/admin apps/web/src/app/router.tsx
git commit -m "feat: secure admin sessions"
```

---

### Task 12: Admin Product, Inventory, and Order Management

**Files:**
- Create: `apps/api/src/modules/products/admin-product.routes.ts`
- Create: `apps/api/src/modules/orders/admin-order.routes.ts`
- Create: `apps/api/tests/admin-products.test.ts`
- Create: `apps/api/tests/admin-orders.test.ts`
- Create: `apps/web/src/features/admin/AdminDashboardPage.tsx`
- Create: `apps/web/src/features/admin/AdminProductsPage.tsx`
- Create: `apps/web/src/features/admin/AdminProductForm.tsx`
- Create: `apps/web/src/features/admin/AdminOrdersPage.tsx`
- Create: `apps/web/src/features/admin/AdminOrderPage.tsx`
- Create: `apps/web/src/features/admin/admin.css`
- Create: `apps/web/src/features/admin/AdminOrdersPage.test.tsx`
- Modify: `apps/api/src/modules/products/product.service.ts`
- Modify: `apps/api/src/routes.ts`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Produces: authenticated `GET/POST/PATCH /api/v1/admin/products`, `PATCH /api/v1/admin/products/:id/inventory`, `GET /api/v1/admin/orders`, and `PATCH /api/v1/admin/orders/:id`.
- Order patch accepts `{ status: OrderStatus, paymentStatus?: PaymentStatus, paymentUrl?: string | null }` with explicit allowed status transitions.
- Product form manages core product fields, stock count, existing image URLs, and optional GLB/USDZ metadata; binary cloud upload remains outside the local demo.

- [ ] **Step 1: Write failing admin authorization and transition tests**

```ts
it("rejects anonymous product mutations", async () => {
  expect((await request(createApp()).patch(`/api/v1/admin/products/${housePlant.id}/inventory`).send({ quantity: 4 })).status).toBe(401);
});

it("allows CONFIRMED to PREPARING but rejects DELIVERED to PREPARING", async () => {
  const agent = await loggedInAgent();
  expect((await agent.patch(`/api/v1/admin/orders/${confirmed.id}`).send({ status: "PREPARING" })).status).toBe(200);
  expect((await agent.patch(`/api/v1/admin/orders/${delivered.id}`).send({ status: "PREPARING" })).status).toBe(409);
});
```

- [ ] **Step 2: Run tests and verify protected endpoints are absent**

Run: `npm run test -w @qleaves/api -- admin-products.test.ts admin-orders.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement admin services and UI**

Use explicit DTOs and Zod schemas; require admin middleware on the router; use an allowlist transition map for order statuses; validate HTTPS payment URLs in production while permitting `http://localhost` during development. Build accessible tables that collapse into labelled cards on mobile, confirmation dialogs for publishing changes, stock controls, order filtering, and clear mutation success/error feedback.

- [ ] **Step 4: Run module, UI, and full tests**

Run: `npm run test -w @qleaves/api -- admin-products.test.ts admin-orders.test.ts`

Run: `npm run test -w @qleaves/web -- AdminOrdersPage.test.tsx`

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules apps/api/src/routes.ts apps/api/tests/admin-products.test.ts apps/api/tests/admin-orders.test.ts apps/web/src/features/admin apps/web/src/app/router.tsx
git commit -m "feat: manage products inventory and orders"
```

---

### Task 13: End-to-End Local Demo and Documentation

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/customer-order.spec.ts`
- Create: `apps/web/e2e/admin-order.spec.ts`
- Create: `apps/web/e2e/ar-fallback.spec.ts`
- Create: `apps/web/e2e/helpers.ts`
- Create: `README.md`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: affected source files discovered by verification

**Interfaces:**
- Produces: root `npm run test:e2e` that starts the API and web server against an isolated seeded test database.
- Produces: documented local workflow and credentials.
- Produces: `fillGuestCheckout(page, { paymentMethod })`, `loginAsDevelopmentAdmin(page)`, and `resetE2eDatabase()` in `e2e/helpers.ts`.
- Consumes: all previous public and admin routes.

- [ ] **Step 1: Write end-to-end customer and admin paths**

```ts
test("guest places a COD order and admin progresses it", async ({ page }) => {
  await page.goto("/shop");
  await page.getByRole("link", { name: /view house plant/i }).click();
  await page.getByRole("button", { name: /add to cart/i }).click();
  await page.getByRole("link", { name: /checkout/i }).click();
  await fillGuestCheckout(page, { paymentMethod: "COD" });
  await page.getByRole("button", { name: /place order/i }).click();
  await expect(page.getByText(/QL-\d{8}-[A-Z0-9]{6}/)).toBeVisible();
});
```

Add a second test that logs in as the development admin, finds the created order, and changes it from `CONFIRMED` to `PREPARING`. Add an AR fallback test that blocks the GLB request and verifies retry plus an enabled Add to Cart button.

- [ ] **Step 2: Run E2E tests and record concrete failures**

Run: `npm run test:e2e`

Expected: initial failures identify any missing integration wiring; no test may be weakened to hide a product defect.

- [ ] **Step 3: Fix integration gaps and write the README**

Document prerequisites, the exact three-command startup, local URLs, development credentials, database reset, test commands, build commands, AR HTTPS limitation, supported fallback, model attribution, and the deferred production integrations. Fix only defects exposed by the specified end-to-end paths.

- [ ] **Step 4: Run the complete verification matrix**

Run: `npm run setup`

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

Run: `npm run test:e2e`

Expected: every command exits 0. Manually start `npm run dev`, open the three documented URLs, verify no console errors, test keyboard navigation, enable reduced motion, and interact with the 3D model. Record Android and iPhone physical AR testing as pending until the app is served over HTTPS; do not claim native AR verification from localhost.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example package.json apps/web/e2e apps/web/playwright.config.ts apps/api apps/web/src
git commit -m "test: verify complete local QLeaves demo"
```

---

## Final Review Gate

After Task 13, invoke `superpowers:verification-before-completion` and run the complete verification matrix again from a clean terminal. Then invoke `superpowers:requesting-code-review`, review the entire implementation against `docs/superpowers/specs/2026-09-03-qleaves-storefront-design.md`, and address all blocking findings before presenting the local demo as complete.
