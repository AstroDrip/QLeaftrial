# API and backend audit

All routes are mounted under `/api/v1` (`apps/api/src/routes.ts`). Admin routes use the `qleaves_admin` session
cookie (`requireAdmin`). Every route listed has a frontend caller; **no unused or duplicate endpoint was found**.

## Endpoint inventory (checkout-related)

| Method and path | Caller | Auth | Validation | DB / external | Tests |
| --- | --- | --- | --- | --- | --- |
| `POST /orders` | `CheckoutPage` | public, 10 per 15 min per IP | `createOrderSchema` (strict) + `Idempotency-Key` format | one transaction: products, inventory, order, items, location; then Sheets mirror | `orders`, `reliability`, `order-journey`, `delivery-charge`, `delivery-location` |
| `POST /geo/search`, `POST /geo/reverse` | `LocationPicker` | public, 120 per min per IP (in memory) | Zod, strict | none (in-memory index) | `delivery-location` |
| `GET /storefront/settings` | `useStoreSettings` | public, cached | — | StoreSettings | `reliability` |
| `GET /invoices/:orderNumber?token=` | `PublicInvoicePage` | HMAC token per order, rate limited | token check | order read | `invoice` tests |
| `GET /admin/orders` | `AdminOrdersPage` | admin | — | all orders with items and location | `orders` |
| `PATCH /admin/orders/:id/status` | admin | admin | `updateOrderStatusSchema` | transaction; stock returned on cancel; Sheets | `orders`, `order-journey` |
| `POST /admin/orders/:id/accept-edited` | admin | admin | `acceptEditedOrderSchema` | transaction; stock reconciled; Sheets | `orders` |
| `PATCH /admin/orders/:id/delivery-fee` | admin | admin | whole QAR, 0–1000 | order update; Sheets | `delivery-charge` |
| `PATCH /admin/orders/:id/payment` | admin | admin | enum | order update; Sheets | `order-journey` |
| `DELETE /admin/orders/:id`, `DELETE /admin/orders`, `POST /admin/orders/bulk-delete` | admin | admin | ids | delete (terminal orders only) | `orders` |
| `GET /admin/dashboard`, `GET /admin/sales` | admin | admin | dates | aggregates | `orders` |
| `GET /admin/sheets/status`, `POST /admin/sheets/sync`, `POST /admin/sheets/sync/:orderId` | admin | admin | — | Google Sheets | `order-sheet` |

## Findings

Observed = reproduced in the isolated test database on 14 Nov 2026. Code = evident from reading the code.

| ID | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| B1 | **Payment update hides every failure as "Order not found".** `updatePaymentStatus` wraps the update in a bare `catch` and always throws 404. A database outage while marking an order paid tells the admin the order does not exist. | Code: `order.service.ts`, `updatePaymentStatus` | P1 |
| B2 | **A declined order can be marked Paid.** No status check on the payment route. | Observed: `PATCH …/payment` on a CANCELLED order → 200, `paymentStatus: PAID` | P1 |
| B3 | **The delivery charge can be changed after the order is completed and paid**, which changes the total of a paid invoice and its sheet row. | Observed: fee set to 25 on a DELIVERED + PAID order → 200 | P1 |
| B4 | **Phone numbers are not validated beyond length.** | Observed: `"aaaaa"` and `"+++++"` accepted (201). The admin's WhatsApp link strips non-digits, so it would be empty. | P2 |
| B5 | **Area and pin can contradict each other.** `area` must be one of four names, while the pin may be anywhere in Qatar. | Observed: pin in Lusail (Al Daayen) with `area: "Doha"` → 201 | P1 |
| B6 | **Order response returns internal columns** to the customer who placed it: `idempotencyKey`, `editSummary`, `paymentUrl`, `sheetSyncedAt`, `sheetSyncError`. No other customer's data, but more than the page needs. | Observed: response keys | P2 |
| B7 | **Rate limit counts invalid attempts and is per IP.** Ten requests in 15 minutes, including failed validations; shoppers behind one shared address (an office, mobile carrier NAT) share the budget. | Observed: 5 invalid + 5 valid, 11th → 429 | P2 |
| B8 | **Stock is decremented in an unspecified order.** Two concurrent orders containing the same two products in opposite order could deadlock in PostgreSQL; the deadlock error is not mapped and would return 500. | Code: `insertOrder` loop over `findMany` results. Not reproduced (SQLite cannot show it). | P2 (potential) |
| B9 | **`GET /admin/orders` returns every order ever placed**, with items and location, on each admin page load. | Code: `listOrders` has no limit | P2 |
| B10 | **Sales and dashboard figures ignore the delivery charge.** | Observed: report revenue 180 for an order whose total is 205 | P2 |
| B11 | **Sheets mirror is awaited inside admin requests** (up to 6 s when Google is slow). Deliberate on Vercel (no background work after the response), but admin actions feel slow during a Google outage. | Code: `mirrorOrderToSheet` | P3 |
| B12 | Stock and "product unavailable" errors reach the customer as the server's English sentence, also on the Arabic site. | Code: `friendly-error.ts` maps only outage codes | P2 |

## Contract check (frontend ↔ backend)

- Field names and types match for the order request, including `deliveryLocation` and `deliveryLocationManual`.
- Money is whole QAR integers end to end (database `Int`, no floats, no rounding step), so 149.99 cannot occur;
  the threshold is `subtotal < 150`, decided on the server (`lib/delivery.ts`) and imported by the web app.
- The admin type `AdminOrder` marks the newer fields optional, so an older API response cannot crash the page.
- Error parsing: `lib/api-error.ts` tolerates a non-JSON error body.
- A legacy optional `deliveryFeeQar` is still accepted on `POST /orders` and ignored (kept for cached old pages).

## What is sound

Server-side pricing; strict schemas; one transaction for order, items, stock and location; conditional stock
decrement (no oversell); idempotency key with unique index and replay; order-number retry; database-outage mapping
to 503; no secrets or connection strings in logs; Sheets failures isolated from orders.
