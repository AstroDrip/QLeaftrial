# Dead code and technical debt

Method (14 Nov 2026): an import-graph walk from the real entry points (`apps/web/src/main.tsx`,
`apps/api/src/server.ts`, `api/index.ts`, every script and test), following static and dynamic imports; a check of
every exported name against all other files; a check of every CSS class against all TS/TSX text (including
template-built names); and a check of every package against imports and npm scripts. Nothing was deleted.

Classes: **A** confirmed dead · **B** probably unused · **C** legacy but referenced · **D** duplicate ·
**E** needs a human decision.

## Result in one line

The codebase is lean: of 100 web and 49 API runtime files, **every API file and all but one web file are reachable**.
There are no unused routes, controllers, services, middleware, hooks or components.

## Findings

| # | Item | Class | Evidence | Suggested action |
| --- | --- | --- | --- | --- |
| 1 | `apps/web/src/content/en.ts` | C | Imported only by `app/App.test.tsx`; the app itself uses `content/locales.ts` | Point the test at `locales.ts`, then delete |
| 2 | `siteLocaleLabels` in `content/locales.ts` | A | No reference in any file | Delete the export |
| 3 | CSS `.location-picker__adjust` (2 rules, `location-picker.css`) | A | The "Adjust pin" button was removed in `d100ba3`; no TSX uses the class | Delete the rules |
| 4 | CSS `.site-menu__count` (`global.css`) | A | No TSX uses it (the menu uses `site-menu__subcount`) | Delete |
| 5 | CSS `.site-header--hero …` (`LanguageToggle.css`) | A | The header never gets that class since the hero redesign | Delete |
| 6 | CSS `.admin-business-settings__warning` (`admin.css`) | A | No TSX uses it | Delete |
| 7 | Types `ProductUploadMetadataInput`, `LoginInput`, `BulkDeleteOrdersInput` | A | Exported, never imported | Delete the exports |
| 8 | `Order.paymentUrl` column | B | Not read or written anywhere in `apps/api/src` or `apps/web/src`; only returned inside the raw order | Stop returning it now; drop the column later in its own migration, after confirming production holds no values |
| 9 | `StoreSettings.deliveryFeeQar` column | C | Schema comment says "unused … kept so no data migration is needed"; the test helper still sets it | Leave; drop with #8 |
| 10 | Optional `deliveryFeeQar` in `createOrderSchema` | C | Accepted and ignored "for older cached pages"; those pages are weeks old now | Remove after the next release |
| 11 | `@playwright/test`, `apps/web/e2e/mobile-overflow.spec.ts`, `playwright.config.ts`, script `test:e2e` | E | A real, working test; but project instructions say not to use Playwright | Your decision: keep as an optional check, or remove all four |
| 12 | `apps/api/scripts/move-database.ts`, `publish-demo-drafts.ts` | E | One-off operator scripts, already used (Mumbai move, demo publishing); referenced only in docs | Keep (they document what was done) or move to `scripts/archive/` |
| 13 | `apps/api/scripts/maps/peek-tile-fields.ts`, `try-geo.ts`, `try-municipality.ts` | C | Developer helpers named in `docs/maps/README.md` | Keep |
| 14 | Exports used only by tests (for example `orderToRow`, `floatingCartStyle`, `photosOf`) | C | Exported so tests can reach them | Keep |
| 15 | Semi-style status names (`pending`, `accepted`, `declined`, `completed`) in `order.service.ts` | C | Still sent by the admin UI and covered by a test | Keep |

**Duplicates (D):** none found. Search, category and delivery rules each have one implementation, shared by the API
and the web app through re-export files (`features/catalog/search.ts`, `shop-categories.ts`, `cart/delivery-rules.ts`).

**Not dead although a text search might suggest it:** historic Prisma migrations (needed to reproduce databases);
`api/index.ts` (the Vercel entry); `scripts/verify-vercel-*.mjs` (run by `vercel-build`); dynamic route imports in
`app/route-modules.ts`; `maplibre-gl-worker.mjs` (loaded by URL).

## Dependencies

Unused runtime packages: **none**. (`@prisma/client` is used through the generated clients.) All dev packages are
used by scripts or tooling except Playwright (item 11).

`npm audit` on 14 Nov 2026: 15 advisories in total, **8 in production dependencies**.

| Package | Severity | Reaches production? | Fix |
| --- | --- | --- | --- |
| `proxy-addr`, `body-parser`, `qs` (through `express` 5.2.1) | critical / high / moderate | Yes | `express` 5.3.0, non-breaking |
| `compression` 1.8.1 | high (memory leak on aborted responses) | Yes | 1.8.2, non-breaking |
| `prisma`, `@prisma/config`, `effect`, `deepmerge-ts` | high | Build-time CLI only, not the running API | Needs Prisma 7 (breaking); defer and plan separately |
| `vitest`, `tinypool`, `vite` (dev server), `concurrently`, `shell-quote`, `source-map-js` | critical / high | No (developer machine only) | Patch releases for vite and concurrently; vitest needs a major upgrade, defer |

The `proxy-addr` advisory concerns subnet-based trust; this API uses `trust proxy = 1` (hop count), so it is probably
not exploitable here, but the upgrade is free.

Outdated but healthy: React 19.2 → 19.3, React Query, React Router, `pg`, `maplibre-gl` 6.16 → 6.18 (pinned
deliberately: 6.18 was two days old when installed). No blanket upgrade is recommended.

## Other debt

- No linter is configured, so unused imports and variables are caught only by TypeScript settings.
- `order.service.ts` types its transaction client as `any` in several functions, which hides mistakes the compiler
  could catch.
- `AdminOrdersPage.tsx` holds most copy as long inline objects; workable, hard to review.
