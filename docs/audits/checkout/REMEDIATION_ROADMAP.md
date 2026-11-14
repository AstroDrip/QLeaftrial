# Remediation roadmap

No application code has been changed by this audit. Nothing below starts without approval.

**P0 (wrong totals charged, duplicate or lost orders, unauthorised access, data leakage): none found.**
Prices are computed on the server, orders are transactional and idempotent, stock cannot oversell, and admin and
invoice access are enforced on the server.

## P1 — fix first

| # | Issue | Files | Fix | Side effects | Tests |
| --- | --- | --- | --- | --- | --- |
| 1 | Three finished fixes are not live, including "Use my current location" being blocked on qleaves.qa | `vercel.json` and commits `d709e77`, `16aebd1`, `d100ba3` | Push (no database change needed) | None expected | Live check of the map and the location button |
| 2 | Stale cart: old price, sold-out or unpublished items shown at checkout | `cart-store.ts`, `CartPage.tsx`, `CheckoutPage.tsx`, `order.schemas.ts`, `order.service.ts`, `friendly-error.ts` | Refresh cart lines from the catalogue on cart and checkout and tell the customer what changed; send the subtotal the customer saw; server answers 409 `PRICE_CHANGED` if it differs; translate stock errors | Customers with old carts see a notice once | Web + API tests |
| 3 | Area and pin can disagree | `order.schemas.ts`, `order.service.ts`, `CheckoutPage.tsx`, `locales.ts` | When a pin is confirmed, the server sets `area` from the pin's municipality (all eight accepted); the dropdown is only required for written-address orders | Sheet "Area" column may now show e.g. "Al Daayen" | API + web tests |
| 4 | Declined order can be marked paid; delivery charge editable after payment | `order.service.ts` (`updatePaymentStatus`, `confirmDeliveryFee`) | Refuse payment changes on declined orders; lock the delivery charge once the order is paid or completed | Admin must set the charge before marking paid | API tests |
| 5 | Payment update reports "Order not found" for any failure | `order.service.ts` `updatePaymentStatus` | Only "record not found" becomes 404; everything else goes to the normal error handler | None | API test |
| 6 | Production dependency advisories with non-breaking fixes | `package-lock.json` | `express` 5.2.1 → 5.3.0, `compression` 1.8.1 → 1.8.2 (plus dev `vite`, `concurrently` patches) | Low; full test run after | Whole suite |

## P2 — next

| # | Issue | Fix |
| --- | --- | --- |
| 7 | Retry key lost on page reload (possible second order after a lost response) | Keep the key in `sessionStorage` per cart contents |
| 8 | Phone accepts anything 5–40 characters | Require 7–15 digits (spaces, `+`, `-` allowed); same rule in the form |
| 9 | Rate limit counts invalid attempts, per IP | Count successful orders (10 per 15 min) and allow more attempts (30) |
| 10 | Order response returns internal fields | Return a customer-facing shape only |
| 11 | Checkout ignores "ordering disabled" until submit | Show the paused notice on the page |
| 12 | Reports ignore the delivery charge | Show merchandise and delivery separately in sales and dashboard |
| 13 | Missing indexes | Additive migration `6_order_indexes`: `Order(createdAt)`, `Order(status)`, `OrderItem(orderId)`, `OrderItem(productId)` |
| 14 | Possible deadlock on concurrent multi-product orders | Decrement stock in product-id order |
| 15 | CSP is report-only; no Origin check on admin changes | Review collected reports, then enforce; add an Origin check |
| 16 | No record of who marked paid or confirmed a charge | Needs a decision (single admin today); could add `paidAt`, `paidBy` |
| 17 | Forgotten pending orders hold stock | Show order age in admin; auto-expiry only if you want it |

## P3 — cleanup (confirmed dead code only)

Delete: `content/en.ts` (after pointing its one test at `locales.ts`), `siteLocaleLabels`, four unused CSS rule
groups, three unused exported types. Stop returning `paymentUrl`. Leave the two unused database columns for a later
migration. Details and evidence: `DEAD_CODE_AND_TECH_DEBT.md`.

## Needs your decision

| Question | Why it matters |
| --- | --- |
| Keep or remove the Playwright e2e test and package? | It works, but your instructions say not to use Playwright |
| Is the customer email needed? | It is required at checkout and never used |
| ~~Should orders outside the four delivery areas be accepted or refused?~~ Answered 2026-11-14: delivery is Qatar-wide, every municipality is accepted. Item 3 is done (area follows the pin on the server). | Closed |
| Prisma 7 and Vitest 5 upgrades (remaining advisories, build-time and dev-only) | Breaking upgrades; separate piece of work |
| Revoke the old Frankfurt key and remove that project | Still open from 12 Nov |

## Order of work after approval

1. Record the baseline (218 API, 231 web tests passing).
2. P1 items 4, 5, 6 (small, server-only), tests after each.
3. P1 item 3, then item 2 (touch checkout and the API contract).
4. P2 items 7–14; migration `6_order_indexes` prepared but applied by you through the terminal, as before.
5. P3 cleanup in one commit, tests after.
6. Layout audit at 360, 390, 768, 1366 and 1440 in English and Arabic; full local order journey; final report.
7. Push only when you say so.
