# Product experience, catalogue and reliability: audit and plan

Written 2026-11-17. Approved by the owner on 2026-11-17 with these answers:

1. "Never database" was a typo. Plant-care details may be stored in the database where the site needs them.
2. Sparkle Plante has approved QLeaves reusing its product photographs (matching rules in stage 7 still apply).
3. Outdoor fields (height, size note, pot included, handling note) approved.
4. About page: change only "indoor plant store" to "plant store" (English and Arabic).
5. The invoice reference will be supplied last; stage 8 waits for it.

## 1. Repository state

| Item | Value |
|---|---|
| Branch | `main` |
| Commit | `7aa2d76c0cf17049287f48511aa71524d46011bd` (local and `origin/main` identical, nothing uncommitted) |
| Live site | Runs this commit: `/api/v1/ready` answers `schema: current`, an order without a key is refused (400), the homepage carries its built-in product data, no Google font links |
| Production database | Migrations 0 to 7 applied (owner confirmed migration 7 on 2026-11-17) |
| Other worktrees | `.worktrees/qleaves-storefront` (`feature/qleaves-storefront`, old) and one outside the project; untouched |

Implementation will happen on a new branch `feature/product-experience` in its own worktree
(`.worktrees/product-experience`), started from `7aa2d76`. `main` stays as it is until you approve a merge.

## 2. What the code does today, per requirement

| # | Requirement | Today | Status |
|---|---|---|---|
| 4 | Two full category cards on phones | `home.css`: phone card width `min(72vw, 250px)`, so one card and part of the next show on purpose. `CategoryRail.tsx` measures one card plus gap as its glide step; auto-glide, swipe, arrows, three loop copies, pause when hidden, reduced motion all exist | Change needed (sizing and glide step) |
| 5 | Product photos crossfade on cards | `ProductCard` passes all media to `ProductImage`, which shows only the first catalogue photo | Missing |
| 5 | Detail gallery crossfade and autoplay | `ProductGallery` has thumbnails; it remounts the image on each change (`key={index}`), which is the snap; no autoplay | Partial |
| 5 | Photos grouped correctly | `photosOf` pairs rows by order only (catalogue row followed by detail row); no field links a photo's two sizes | Fragile |
| 6 | Up to three photos per product in admin | Create and replace both require exactly two staged variants (one photo); replacing deletes all media | Missing |
| 6 | Duplicate photo detection | None; no content hash stored | Missing |
| 7 | Sparkle Plante images | Not used anywhere; `docs/catalogue/photo-report.md` lists 122 photos and flags at least 11 uncertain identifications | Needs your approval first |
| 8 | Plant Care section | Product page shows light, watering, care level, placement as plain facts. No humidity, soil or temperature fields | Partial; needs your answer on "Never database" |
| 9 | Outdoor and large plants | Category exists with Arabic label. No fields for height or size, pot included, or handling notes | Partial |
| 10 | Homepage variety | Shelves are newest-first with a shared "already shown" set; the built-in homepage data holds one photo per product | Missing |
| 11 | Shop pagination | Numbered pages, previous and next, ellipses, page in the URL, scroll to top: all present | Present; needs tests |
| 12 | Indoor-only wording | Found 3 places: the About page introduction sentence (EN and AR) and the page title used for link previews (`og:title` "Indoor plants in Qatar"). The homepage description already says indoor and outdoor | Small change |
| 13 | New products default to 0 QAR | Admin form default is 0; publishing a product priced 0 is blocked; orders refuse products priced 0. Seed prices are development data only | Present; needs an admin warning and tests |
| 14 | Invoice redesign | Shared invoice component for admin and public link exists | Waiting for your reference |
| 15 | Static-first storefront | Built-in homepage data, static catalogue, IndexedDB copy, freshness checks: present and tested | Present; must carry up to 3 photos |
| 16 | Admin pagination | Admin products, orders (and invoices, built from orders) and reviews return every row | Missing |
| 17 | Order safety and notifications | Device-saved orders, keys, fingerprints, outbox worker, Resend, Sheets: present and tested | Present; production setup unverified (see below) |
| 18 | Qatar map | Present and tested | Keep; regression tests only |
| 19 | Card payments | Not built; "Payment link" is a manual link | Deferred (needs a provider) |
| 20 | Security and backups | Earlier findings stand: no Origin check on admin actions, report-only CSP, backups unverified | Missing |
| 22 | Browser tests | One Playwright spec (17 lines) | Missing |

Not verifiable from here (needs your dashboards): whether `EMAIL_PROVIDER_API_KEY`, `ORDER_NOTIFICATION_EMAIL` and
`CRON_SECRET` are set in Vercel, whether the daily Vercel job runs, whether `pg_cron` and `pg_net` exist on the
Supabase project, and what backups the Supabase plan provides. The live worker endpoint does refuse requests without
the secret (401).

Tools: the Humanizer skill is not installed in this environment, so copy will follow its principles by hand. The
Superpowers planning, test-first, debugging and verification skills are available and will be used.

## 3. Stages

Each stage is its own commit (or a few), with tests, typecheck, build and the overlap audit at 320 to 1440 px in
English and Arabic before it is called done. Nothing is pushed, deployed or migrated in production without your yes.

### Stage 1. Category rail: two whole cards
- Phone and tablet card width is calculated from the rail's real width: (visible width minus one gap) / 2. Wider
  screens show as many whole cards as fit; the visible width is trimmed so no partial card shows at rest.
- The glide moves one card and comes to rest on a card edge (scroll snap), in both directions and in RTL.
- Done when: at 320, 360, 390, 430, 720, 768, 1024, 1280, 1440 px, EN and AR, exactly two whole cards (phones) and
  no sliver of a third show at rest; swipe, arrows, auto-glide, reduced motion still work. Playwright checks this.
- Files: `home.css`, `CategoryRail.tsx`, a new rail test.

### Stage 2. Photo slideshow on cards and product page
- One shared crossfade component: two stacked image layers; the next photo is fully loaded (`decode()`) before a
  650 ms opacity crossfade. No remount, no blank frame, fixed box so nothing shifts.
- Cards cycle only while on screen (IntersectionObserver) and the tab is visible; one shared timer drives all visible
  cards, staggered so they don't change together. Reduced motion: no autoplay, first photo only.
- Product page: the same crossfade, autoplay every few seconds, thumbnails and previous/next buttons; a manual
  choice pauses autoplay for a while; the selected thumbnail is marked.
- Card photos use the catalogue size, the product page the detail size; only the next photo is preloaded.
- One unique photo: no slideshow. Duplicate URLs are never shown twice.
- Done when: in a real browser a visible card changes photo with no scrolling, the frames sampled during a change
  show both images partly visible (a crossfade, not a cut), no layout shift is measured, hidden cards make no image
  requests beyond their first photo.
- Files: new `features/catalog/PhotoCrossfade.tsx`, `ProductCard.tsx`, `product-presentation.tsx`, CSS, tests.

### Stage 3. Admin: up to three photos per product
- Each photo is still uploaded straight to Supabase Storage by signed URL and saved as two WebP sizes.
- Migration 8 (additive, both databases): `ProductMedia.photoKey` (links a photo's two sizes; replaces pairing by row
  order) and `ProductMedia.contentHash` (SHA-256 of the original, for duplicate detection). Existing rows are filled
  from their current pairing.
- New admin endpoints to add, remove, reorder, set as main, and replace one photo, each in one transaction;
  removed files are deleted from storage only after the database no longer points to them.
- Admin product editor: three photo slots with preview, progress, errors, duplicate warning, drag or button
  reordering, "main photo" choice. Editing other details never touches photos.
- Products with fewer than three photos are flagged in the admin list ("1 of 3 photos").
- Files: both schemas and migrations, `admin-product.schemas.ts`, `admin-product.service.ts`,
  `product-upload.service.ts`, `catalogue.ts`, `home-bootstrap.ts`, `AdminProductsPage.tsx`, tests.

### Stage 4. Plant Care section
- Waits for your answer on "Never database" (question 1).
- Built after the description: a heading and one row per known item (light, water, humidity, soil, temperature,
  care level, placement) with a small icon drawn as inline SVG in the site's existing icon style; no new icon
  package. Missing items are left out, never filled with defaults.
- Content: only species-specific facts I can source; anything uncertain is marked for review and stays off the page
  until confirmed. No health, pet-safety or air-purifying claims.

### Stage 5. Outdoor and large plants
- Uses the existing Outdoor Plants category (no new category).
- If you approve (question 3), additive fields: height in cm, a size note (EN and AR), "pot included" yes/no, a
  handling or delivery note (EN and AR). Sun suitability uses the existing light and placement fields.
- Shown on cards (size), product page, filters (placement and size), search, admin, catalogue, homepage counts.
- No change to delivery charges.

### Stage 6. Homepage variety
- A seed per browsing session (kept in sessionStorage, renewed daily) picks which eligible products and which photo
  each card starts on. Featured stays your selection (only its order varies); New Arrivals draws from the newest
  plants (still no Garden Accessories); no product appears twice across shelves; no photo is shared across products.
- Works from the built-in homepage data before the API answers (that data grows to hold a wider pool, measured).
- The shop page order, filters, pagination and URLs are not affected.

### Stage 7. Copy, prices, catalogue quality
- Indoor-only wording: the three places in section 2 (About page sentence only with your yes, question 4).
- Admin warning on any product priced 0 ("price not confirmed, cannot be published"); tests for the existing rules.
- Sparkle Plante matching report (only with your yes, question 2): name and species matches only, one photo per
  product, nothing assigned when unsure; uncertain products stay unpublished.

### Stage 8. Invoice
- Waits for your reference. I will not design a layout myself.

### Stage 9. Admin speed, scheduling, backups, security
- Admin products, orders, invoices and reviews: pages of 25 (50 or 100 by choice), search, filters, sorting,
  thumbnails only in lists. Database indexes as needed (additive).
- Origin check on admin actions; content security policy moved from report-only to enforced after a clean report
  period; dependency audit.
- With you: confirm Vercel variables, the daily job, `pg_cron`, and run a backup and restore drill.

### Stage 10. Final QA
- Full Vitest, PostgreSQL and Playwright runs (the 22 journeys in the brief, desktop and phone, EN and AR,
  screenshots inspected), overlap audit, build, measurements (storage, transfer, request counts, snapshot size for
  500 products with 3 photos), final reports.

## 4. Database changes

| Migration | Contents | Needs |
|---|---|---|
| 8 | `ProductMedia.photoKey`, `ProductMedia.contentHash` | Stage 3 |
| 9 | Plant care fields | Only if your answer to question 1 allows it |
| 10 | Outdoor size and handling fields | Only with your yes to question 3 |
| 11 | Admin list indexes | Stage 9, if measurements show the need |

All additive and mirrored in the SQLite schema. You apply each to production before the code that needs it goes
live; the build check refuses a deploy otherwise.

## 5. Questions

1. **"Never database" (Plant Care):** did you mean the care details (humidity, soil, temperature) must not be stored
   in the database, or something else? Nothing is added to the database for this until you answer.
2. **Sparkle Plante photos:** has the partner approved QLeaves reusing their product photographs? Without a yes I
   will not download or use any of them.
3. **Outdoor fields:** may I add height (cm), a size note, "pot included" and a handling note to products?
4. **About page sentence:** it reads "QLeaves is a Qatar-based online indoor plant store." (and the Arabic
   equivalent). May I change only "indoor plant store" to "plant store" there?
5. **Invoice reference:** please attach it when you are ready; stage 8 waits for it.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Three photos per product make the catalogue file larger | Only catalogue-size photo URLs go in the list data; measured at 500 products before and after |
| Many animated cards drain phones | Only cards on screen animate, one shared timer, none when the tab is hidden or reduced motion is on |
| Re-pairing existing photos in migration 8 | Done from today's order rule, verified by a test on a copy of the data before any production run |
| Random shelves confuse returning visitors | Same arrangement for the whole session and day |
