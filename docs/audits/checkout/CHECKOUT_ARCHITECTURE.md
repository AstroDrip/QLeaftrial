# Checkout architecture (as found on 14 November 2026)

Audited state: branch `main`, commit `d100ba3`, clean working tree. `origin/main` (the live site) is at `c4a1c79`;
three local commits are not pushed (`d709e77`, `16aebd1`, `d100ba3`). Everything below describes the local code.

- Frontend: React 19, Vite 7, React Router 7, React Query 5, Zustand 5, plain CSS. `apps/web`.
- Backend: Express 5 on Node 24, Zod 4 validation, Prisma 6.16 (`apps/api`), exposed on Vercel through `api/index.ts`.
- Database: Supabase PostgreSQL (Mumbai) in production, SQLite in development and tests. Two Prisma schemas kept in step.
- Package manager: npm workspaces (`apps/*`). No linter is configured (`lint` script does not exist).

## 1. Component map

| Step | File | What it does |
| --- | --- | --- |
| Cart state | `apps/web/src/features/cart/cart-store.ts` | Zustand store persisted to `localStorage` (`qleaves-cart`). Each line holds a **snapshot** of name, price and stock taken when the product was added. |
| Add / change quantity | `features/cart/AddToCartButton.tsx`, `CartPage.tsx` | Clamp quantity to the snapshot stock. |
| Floating cart | `features/cart/FloatingCartBar.tsx`, `FreeDeliveryProgress.tsx`, `free-delivery-store.ts` | Totals from the same store; hidden on `/cart`, `/checkout`, `/order/…`, `/invoice/…`. |
| Checkout page | `features/checkout/CheckoutPage.tsx` | One form: name, phone, email, address line, area (4 options), delivery location, payment method, notes. One `POST /api/v1/orders`. |
| Delivery location | `features/checkout/LocationPicker.tsx`, `delivery-location.ts`, `features/map/*` | Search, current location, tap-to-pin; explicit confirmation; fills street, landmark, address line and area. |
| Delivery lines | `features/checkout/DeliveryLines.tsx`, `features/cart/delivery-rules.ts` | "Free" at 150 QAR or more, "To be confirmed" below. Rule imported from the API's `lib/delivery.ts`. |
| Confirmation | `features/checkout/OrderConfirmationPage.tsx`, `order-summary.ts` | Shows the summary the server returned (kept in router state and `sessionStorage`); no public order lookup exists. |
| Invoice (customer) | `features/invoice/PublicInvoicePage.tsx` | Loads `GET /invoices/:orderNumber?token=…`; the link is sent by the shop over WhatsApp. |
| Admin orders | `features/admin/AdminOrdersPage.tsx`, `OrderDeliveryAndSheet.tsx`, `OrderLocation.tsx` | Order cards: accept / edit / decline / complete, paid toggle, delivery charge, location, sheet status, WhatsApp message, invoice. |

## 2. Frontend to backend

| Frontend caller | Request | Handler |
| --- | --- | --- |
| `CheckoutPage.handleSubmit` | `POST /api/v1/orders` + `Idempotency-Key` | `order.routes.ts` → `order.service.createOrder` |
| `LocationPicker` via `map/geo-api.ts` | `POST /geo/search`, `POST /geo/reverse` | `geo.routes.ts` → `lib/geo/qatar.ts` |
| `QatarMap` | `GET /maps/qatar.pmtiles` (range requests), `/maps/fonts/…` | static files (Vercel CDN) |
| `useStoreSettings` | `GET /storefront/settings` | `store-settings.routes.ts` |
| Catalogue / product pages | `GET /catalogue`, `/products`, `/products/:slug`, `/products/filters` | `product.routes.ts` |
| Admin screens (`admin-api.ts`) | `/admin/orders…`, `/admin/sheets…`, `/admin/dashboard`, `/admin/sales` | `order.routes.ts`, `sheets.routes.ts` behind `requireAdmin` |
| `PublicInvoicePage` | `GET /invoices/:orderNumber?token=` | `invoice.routes.ts` |

Checkout sends **product ids and quantities only**. No price, subtotal, discount, status or payment state is accepted
from the browser (the schema is `.strict()`; extra fields are rejected with 400).

## 3. Database relationships

```
Product 1─1 Inventory            Product 1─* ProductMedia
Product 1─* OrderItem (Restrict) Order 1─* OrderItem (Cascade)
Order 1─0..1 OrderDeliveryLocation (Cascade)
AdminUser 1─* AdminSession       RateLimitBucket (limiter, keyHash)   StoreSettings (single row)   Review *─0..1 Product
```

There is **no Customer, Cart, Payment, Invoice or Discount table**. Customer details live on the order; the cart
lives in the browser; payment is two columns on the order (`paymentMethod`, `paymentStatus`); an invoice is a view of
the order (number `INV-<orderNumber>`); the only "discount" is a display-only `compareAtPriceQar` on a product.

## 4. External integrations

| Integration | Where | Failure effect |
| --- | --- | --- |
| Supabase PostgreSQL | `lib/prisma.ts` | 503 `DATABASE_UNAVAILABLE` (mapped in `middleware/error-handler.ts`) |
| Supabase Storage | `admin/product-image-storage.ts` | Admin image uploads only; not on the order path |
| Google Sheets | `sheets/order-sheet.ts`, `google-auth.ts` | Never fails an order; result recorded on the order (`sheetSyncedAt`, `sheetSyncError`) |
| WhatsApp | `admin/order-messages.ts` | A `wa.me` link the admin clicks; nothing is sent automatically |
| Map data | static files | Checkout offers a written-address fallback |
| Payment gateway, email, SMS | **none exist** | — |

## 5. Order lifecycle

```
Customer: cart (browser) ─► checkout form ─► confirm pin ─► POST /orders
Server (one transaction): validate ─► read published products + prices ─► decrement stock per line
        (conditional update; any shortfall rolls everything back) ─► create Order + OrderItems
        (+ OrderDeliveryLocation) with subtotal, deliveryFee 0, deliveryChargePending = subtotal < 150
        ─► 201 with the order ─► confirmation page
Admin:  PENDING ─► accept (CONFIRMED) | accept edited (stock reconciled) | decline (CANCELLED, stock returned)
        ─► [PREPARING] ─► [OUT_FOR_DELIVERY] ─► DELIVERED         paymentStatus: PENDING ⇄ PAID ⇄ FAILED (manual)
        delivery charge: admin enters it (below 150 QAR)   DELIVERED + PAID ─► row in Google Sheet
```

## 6. Critical files

| File | Responsibility |
| --- | --- |
| `apps/api/src/modules/orders/order.service.ts` | Order creation transaction, stock, status changes, edits, reports |
| `apps/api/src/modules/orders/order.schemas.ts` | The request contract (Zod) |
| `apps/api/src/modules/orders/order.routes.ts` | Routes, rate limit, idempotency header, sheet mirror |
| `apps/api/src/lib/delivery.ts` | The 150 QAR rule (shared with the web app) |
| `apps/api/src/lib/geo/qatar.ts` | Qatar boundary, municipalities, search, reverse lookup |
| `apps/api/src/modules/auth/*` | Admin login, session cookie, `requireAdmin` |
| `apps/web/src/features/checkout/CheckoutPage.tsx` | The checkout form and submission |
| `apps/web/src/features/cart/cart-store.ts` | Cart persistence and subtotal |
