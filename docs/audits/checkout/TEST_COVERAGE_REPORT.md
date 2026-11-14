# Test coverage report

## Baseline (14 Nov 2026, commit `d100ba3`)

| Check | Command | Result |
| --- | --- | --- |
| Type-check (both apps + Vercel entry) | `npm run typecheck` | 0 errors |
| API tests | `npm test -w @qleaves/api` | 31 files, **218 passed**, 0 failed |
| Web tests | `npm test -w @qleaves/web` | 46 files, **231 passed**, 0 failed |
| Production build | `npm run build` | passes |
| Lint | — | no linter configured |

API tests run against an isolated SQLite database (`tests/test-database.ts`), never production. Google is replaced
by an in-memory fake (`tests/order-sheet.test.ts`), so no test order can reach a real spreadsheet. No test sends a
message or a payment (neither exists).

## What is covered

| Lifecycle step | Covered by |
| --- | --- |
| Product retrieval, filters, search | `products`, `product-search*`, `shop-categories` |
| Cart add, quantity, clamp to stock | web `cart-store.test.ts`, `AddToCartButton.test.tsx`, `CartPage.test.tsx` |
| Checkout validation and submission | web `CheckoutPage.test.tsx`; API `orders`, `order-journey` |
| Delivery rule at 149 / 150 / 151 QAR | API `delivery-charge`; web `CheckoutPage.test.tsx`, `OrderConfirmationPage.test.tsx` |
| Delivery location: search, GPS failures, tap, confirm, stale, outside Qatar | web `LocationPicker.test.tsx`; API `delivery-location` |
| Order + items + stock in one transaction, rollback | API `orders`, `order-journey`, `reliability` |
| Duplicate submission, concurrent last unit, order-number clashes | API `reliability` |
| Price and status manipulation | API `reliability`, `order-journey` |
| Admin: accept, edit, decline, complete, delete, payment, delivery charge | API `orders`, `order-journey`, `delivery-charge` |
| Admin location card and status | web `OrderLocation.test.tsx`; API `delivery-location` |
| Invoice link token | API `invoice-link` |
| Google Sheets: success, auth failure, timeout, retry, idempotent rows | API `order-sheet` |
| Database outage | API `database-outage`, `error-handler` |
| Auth, sessions, login limits | API `auth`, `rate-limit`, `security` |

## Gaps (tests to add with the fixes)

| Gap | Linked finding |
| --- | --- |
| Cart price, stock or availability changed before checkout | Failure 1, 2 |
| Declined order cannot be marked paid | Failure 5 |
| Delivery charge locked once paid or completed | Failure 6 |
| Payment update during a database outage answers 503 | Failure 7 |
| Retry key survives a page reload | Failure 8 |
| Rate limit counts only real orders | Failure 9 |
| Phone number rules | Failure 10 |
| Area derived from the pin; outside-area orders | Failure 4 |
| Ordering disabled shown on the checkout page | Failure 12 |
| Sales and dashboard totals with a delivery charge | API finding B10 |
| Order response contains only customer-facing fields | API finding B6 |

## Not testable here

- PostgreSQL-only behaviour (deadlocks, pooler timeouts): tests use SQLite.
- Real devices: iPhone Safari, Android GPS.
- The live Google Sheet: needs your spreadsheet and credentials; never verified end to end by me.
- The live admin location card: needs your admin login.

## Browser verification already done (local site, 13–14 Nov)

Layout and overlap audit of home, shop, cart, checkout (with suggestions open and with a pin), and the admin order
card at 360, 390, 430, 720, 768, 1280, 1366 and 1440 px in English and Arabic; phone gestures on the map (tap,
swipe, pinch) with real touch events; a full order placed and opened in admin with matching coordinates. These used
a script driving installed Chrome through Playwright's library, as a verification tool only.
