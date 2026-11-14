# Checkout failure scenarios

**Observed** = reproduced on 14 Nov 2026 (isolated test database, or a browser run on the local site).
**Code** = follows directly from the code, not run. **Potential** = plausible, not reproduced.

## Defects and risks

| # | Scenario | Trigger | Component | Today | Should be | Sev | Root cause | Fix | Test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Price changed while the item sat in the cart | Admin edits a price; customer's cart is hours old | `cart-store.ts`, `CheckoutPage.tsx` | Checkout shows the old price and total; the order is placed at the new price; the customer first sees the difference on the confirmation page (**Code**) | Cart and checkout show current prices; if they changed, say so before ordering | P1 | The cart keeps a snapshot and never re-reads the catalogue | Refresh cart lines from the catalogue on cart and checkout; send the total the customer saw; server answers 409 `PRICE_CHANGED` with fresh lines | Web test with a changed catalogue; API test for 409 |
| 2 | Item sold out or unpublished while in the cart | Stock reaches 0 or admin unpublishes | same | Submit fails with the server's English sentence; the cart still lists the item (**Code**) | Item marked unavailable in the cart with a clear, translated message | P1 | Same as 1; `friendly-error.ts` maps only outage codes | Same refresh; map `INSUFFICIENT_STOCK`, `PRODUCT_NOT_FOUND` | Web + API tests |
| 3 | "Use my current location" does nothing on the live site | Any live checkout | `vercel.json` header | Blocked by `Permissions-Policy: geolocation=()` (**Observed** on qleaves.qa, 13 Nov) | Works when the customer presses the button | P1 | Old header value | Already fixed in `d709e77`, **not pushed** | Live check after deploy |
| 4 | Pin and area disagree | Pin in Lusail, area "Doha" | `order.schemas.ts`, `CheckoutPage.tsx` | Accepted; the order, invoice and sheet say Doha (**Observed**) | Area follows the pin; outside-area orders are labelled as such | P1 | Area list is four names; map covers Qatar | Derive area from the pin on the server; accept all eight municipalities (**Fixed 2026-11-14**, Qatar-wide delivery) | API test |
| 5 | Declined order marked Paid | Admin taps the paid toggle on a declined order | `order.service.ts` `updatePaymentStatus` | Allowed (**Observed**) | Refused (409) | P1 | No status check | Guard | API test |
| 6 | Delivery charge changed after payment | Admin edits the fee on a completed, paid order | `confirmDeliveryFee` | Allowed; total of a paid invoice changes (**Observed**) | Refused once paid or completed | P1 | Only CANCELLED is blocked | Guard | API test |
| 7 | Database blip while marking paid | Outage during `PATCH …/payment` | `updatePaymentStatus` | "Order not found" 404 (**Code**) | 503 "briefly unavailable" | P1 | Bare `catch` | Catch only "record not found" | API test with a failing update |
| 8 | Response lost, then page refreshed | Order saved, network drops, customer reloads and resubmits | `CheckoutPage.tsx` | The retry key lives in memory only, so a reload creates a **second order** (**Potential**) | Same key reused; same order returned | P2 | Key not persisted | Keep the key in `sessionStorage` per cart | Web test |
| 9 | Several shoppers behind one address | Office or carrier NAT; or one shopper mistyping | `order-rate-limit.ts` | 11th request in 15 min → 429, counting invalid attempts (**Observed**) | Only real orders count; higher ceiling | P2 | One counter for everything | Count successful creations; separate, looser limit for attempts | API test |
| 10 | Nonsense phone number | `aaaaa` | `order.schemas.ts` | Accepted; WhatsApp link unusable (**Observed**) | Rejected with a clear message | P2 | Length-only rule | Require 7–15 digits | API + web test |
| 11 | Two orders with the same two products at once | Concurrent checkouts | `insertOrder` | Possible PostgreSQL deadlock → 500 (**Potential**) | One succeeds, the other retries or gets a clean error | P2 | Unordered row locks | Sort products by id; map `40P01` to a retry | Needs PostgreSQL to reproduce |
| 12 | Ordering switched off mid-session | Admin disables ordering | `CheckoutPage.tsx` | Form still shown; submit returns 503 "briefly unavailable" (**Code**) | Checkout explains ordering is paused | P2 | Page ignores `orderingEnabled` | Read the setting; show the notice | Web test |
| 13 | Order list grows | Months of orders | `listOrders` | Every admin load fetches everything (**Code**) | Recent orders first, older on demand | P2 | No limit, no indexes | Indexes now; paging later | — |
| 14 | Pending order forgotten | Never accepted or declined | process | Stock stays reserved indefinitely | Admin sees how long it has waited | P2 | No ageing indicator | Show age; no auto-cancel without a business decision | — |

## Handled correctly today

| Scenario | Behaviour | Evidence |
| --- | --- | --- |
| Double tap on Place order | One request, one order | Web and API tests |
| Retry after a network error (same page) | Same idempotency key, same order | Web test |
| Stock runs out mid-order | Whole order rolled back | API test |
| Tampered price, total, status or payment state | 400 | Probe |
| Database unavailable | 503 with a reference; form kept | API + web tests |
| Google Sheets down or slow | Order unaffected; failure recorded; retry button | API tests |
| Map or search unavailable | Written-address fallback, order flagged | Web test |
| GPS denied, unavailable, timed out, outside Qatar, low accuracy | Explained; never a default location | Web tests |
| Pin outside Qatar or stale confirmation | 400; customer asked to confirm again | API + web tests |
| Success shown before the server confirms | Never: navigation happens only after a 2xx | Code |
| Cart cleared on failure | Never: cleared only after success | Code |

## Not applicable (does not exist)

Payment gateway timeouts, webhook replay, refunds, discount codes, email or SMS failures: there is no gateway,
webhook, refund flow, discount code or automated message in this system.
