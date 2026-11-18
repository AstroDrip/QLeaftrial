# Product experience, catalogue and reliability: final report

Written 2026-11-18. Branch `feature/product-experience` (worktree `.worktrees/product-experience`), started from
`7aa2d76`. Nothing is pushed, merged or deployed; production data and the production database are untouched.

## What each stage delivered

| Stage | Result | Commit |
|---|---|---|
| 1. Category rail | Two whole cards on phones and tablets, whole cards on wider screens, rests on a card edge, RTL | `a193e5c` |
| 2. Photo slideshow | Cards and product page crossfade up to 3 distinct photos; visibility-aware, reduced motion, CLS 0 | `5110694` |
| 3. Admin photos | Up to 3 photos: add, replace, remove, reorder (buttons and drag), main photo, descriptions, duplicate check, progress; daily clean-up of unused files | `074d75c` |
| 4. Plant Care | Section with icons; humidity, soil, temperature added; empty items hidden; nothing invented | `f3d8c96` |
| 5. Outdoor and large | Height, size note, pot, handling note; Where and Height filters; height on cards | `ac63181` |
| 6. Homepage variety | Per-session, daily-renewed shelves and opening photos; no product twice | `a48f627` |
| 7. Copy and catalogue | About wording, link-preview title, 0 QAR draft rule, Sparkle Plante photo report | `4a7fd75`, `42b72f2` |
| 8. Invoice | Waiting for the owner's reference (journey 22 skipped until then) | none |
| 9. Admin speed, security, backups | Paged admin lists with search and sort, same-site check on admin changes, list indexes, backup and restore drill, owner checklist | `1445ed3` |
| Owner request 2026-11-18 | Every 99 QAR product to 0 QAR, still published; customers see "Price coming soon", cannot order; migrations renamed to apply in order | `a335fee` |
| 10. Final QA | Browser journeys on a safe test API, flaky Sheets test fixed, sweep, measurements, this report | `549fc29` and the commit with this file |

## Checks on the final state

- TypeScript: clean. Vercel configuration check: passed. Production build: passed.
- Vitest: web 304/304, API 289/289 (the Sheets timeout test that failed now and then under load is fixed: three
  consecutive full runs passed).
- PostgreSQL 17 tests: 11/11 (orders under real concurrency, paged lists, backup round trip, migration 9c).
- Playwright: 66 passed, 2 skipped (journey 22, phone and desktop). Phone for every spec; desktop for the journeys.
- Overlap audit (`scripts/overlap-audit.js`): 180 page views (home, shop, a "Price coming soon" plant, a priced
  plant, cart, checkout, About, admin products, orders, invoices) at 320 to 1440 px in English and Arabic: nothing
  reported apart from the intended layers (sticky header over scrolled content, the hero under the category sheet),
  no sideways scrolling, no page errors. Screenshots were inspected.
- Content Security Policy enforced on the production build over 28 pages: no violations (stage 9).

## The brief's 22 browser journeys

| # | Journey | Where |
|---|---|---|
| 1, 2 | Homepage with a slow API, with a failing API | `journeys.spec.ts` |
| 3, 4, 5 | Two whole category cards on phones, touch scrolling, RTL | `category-rail.spec.ts` |
| 6, 7, 8, 9 | Card slideshow without scrolling, real crossfade, 1/2/3 photos, product gallery auto and manual | `product-photos.spec.ts` |
| 10, 11 | Plant Care (EN/AR, empty items hidden); outdoor sizes, filters and facts | `journeys.spec.ts` |
| 12, 13, 14 | Search and filters; pages 2, 3, 4; pagination after filtering | `journeys.spec.ts` |
| 15 | Arabic pages through the overlap audit, no sideways scrolling | `journeys.spec.ts`, `mobile-overflow.spec.ts` |
| 16, 17 | Dropped answer: order recovered after a refresh, exactly one order | `journeys.spec.ts` |
| 18 | Email provider hanging: checkout answered in under 4 s, email marked TIMEOUT for retry | `journeys.spec.ts` |
| 19 | Public invoice only with its signed link | `journeys.spec.ts` |
| 20 | Admin edits price and stock and replaces a photo (real upload); the shop shows them | `journeys.spec.ts` |
| 21 | Admin products and orders in pages | `journeys.spec.ts` |
| 22 | Invoice print against the owner's reference | skipped until the reference arrives |

The journeys run against `apps/api/scripts/e2e-server.ts`: its own throwaway SQLite database, never
`apps/api/.env`, a fake email key whose requests never leave the computer, an in-memory stand-in for photo storage.

## Measurements

- Catalogue snapshot for 500 products with 3 photos each (3,000 photo files): 2.0 MB raw, 155 KB gzip, 115 KB
  brotli (`npx tsx scripts/measure-catalogue.ts 500`). Fetched once by the shop and kept in the browser.
- Homepage built-in data at that size: 48 products, 83 KB raw, 10 KB gzip (inside the page, no request).
- Today's live catalogue: homepage built-in data 35 products, 3.4 KB gzip more than before stage 6.
- First visit on a phone, empty cache, production build served locally: home 31 requests / 688 KB (391 KB photos,
  158 KB scripts, 100 KB fonts), LCP 1.3 s; shop 39 / 894 KB, LCP 0.6 s; product page 24 / 450 KB, LCP 0.6 s; layout
  shift 0 on all three. The map code (1.1 MB uncompressed) loads only on checkout.
- Photo storage: about 80 KB per photo (both sizes), so about 117 MB for 500 products with 3 photos.

## Before this goes live (owner)

1. Run `qleaves-migrations-8-9c.ps1` (migrations 8, 9, 9a, 9b, 9c, including the 99 to 0 QAR price change), then
   push the branch right away: today's live code would show those plants as "0 QAR".
2. The checklist in `docs/deployment/stage-9-owner-checklist.md`: Vercel variables, daily job, `pg_cron`, backup drill,
   CSP report check.
3. Stage 8 when the invoice reference is ready.

## Known limits, stated plainly

- Review stories are not paged (hand-ordered list, a handful of items).
- Search does not look at size notes; the Height and Where filters cover sizes.
- CSP stays report-only until the live reports are checked.
- Dependency audit findings are in development and build tools only; fixing them needs major upgrades (Prisma 7,
  Vitest 5), best done separately.
