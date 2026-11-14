# Database and order integrity

Schemas: `apps/api/prisma/postgresql/schema.prisma` (production) and `apps/api/prisma/schema.prisma` (SQLite).
Production migrations `0_init` … `5_order_delivery_location` are applied on the Mumbai database (confirmed by
`migrate status` on 14 Nov 2026). No production data was read or changed for this audit.

## What happens on `POST /orders` (`order.service.ts`)

1. Zod validates the body; a bad delivery location is rejected before anything is written.
2. An existing order with the same `Idempotency-Key` is returned as-is (no second order).
3. Store settings: ordering must be enabled (else 503 `ORDERING_DISABLED`).
4. **One interactive transaction**:
   - quantities for the same product are merged (observed: two lines of 1 and 2 become one line of 3);
   - products are read where `published` and `priceQar > 0`; any missing one → 400, nothing saved;
   - for each product, `inventory.updateMany({ quantity: { gte: n } }, decrement n)`; a count other than 1 → 409
     `INSUFFICIENT_STOCK` and the whole transaction rolls back;
   - the order is created with its items (name, SKU and unit price **snapshotted**), `subtotalQar` computed from
     database prices, `deliveryFeeQar: 0`, `deliveryChargePending = subtotal < 150`, and the confirmed location.
5. The Google Sheet mirror runs after the commit and cannot fail the order.
6. 201 with the order.

No payment is initiated and no invoice record is created: neither exists as a separate thing in this system.

## Integrity checks

| Question | Answer | Evidence |
| --- | --- | --- |
| Partial order possible? | No. Order, items, stock and location are in one transaction. | Tests "rolls the whole order back when one line runs out of stock", "does not leave a location behind when the order itself fails" |
| Duplicate order on double tap or retry? | No, with the idempotency key. | Tests "creates one order when a double tap sends two requests", "returns the same order when … retried" |
| Oversell of the last unit? | No. The conditional decrement lets one of two buyers through. | Test "lets only one of two customers buy the last item" |
| Stock returned on decline? | Yes, exactly once; terminal orders cannot be reopened. | Tests "puts the stock back exactly once", "returns reserved inventory exactly once" |
| Stock on edit-and-accept? | Reconciled in the same transaction. | Tests "accepts an edited pending order …", "rolls back an edited acceptance …" |
| Prices tamper-proof? | Yes. The request carries no price; extra fields → 400. | Test "charges database prices whatever price the client sends"; probe: `totalQar` → 400 |

## Findings

| ID | Finding | Severity |
| --- | --- | --- |
| D1 | **No reservation concept beyond the decrement**, which is correct for this shop: stock leaves at order time and returns on decline. A pending order that is never accepted or declined holds stock indefinitely; there is no reminder or expiry. | P2 (process) |
| D2 | **Missing indexes for admin queries.** `Order` has no index on `createdAt` or `status`; `OrderItem` has no index on `orderId` or `productId` (PostgreSQL does not index foreign keys automatically). `listOrders`, `dashboardStats` and `salesReport` scan. Harmless at today's volume, slow later. | P2 |
| D3 | **Payment history is not recorded.** `paymentStatus` is overwritten; there is no record of who marked an order paid or when. `deliveryFeeConfirmedAt` exists but not who confirmed. | P2 |
| D4 | **`Order.paymentUrl` is never read or written** by any code. | P3 (see dead-code report) |
| D5 | **`StoreSettings.deliveryFeeQar`** is documented in the schema as unused. | P3 |
| D6 | `Order.area` is free text limited by the API to four names; the municipality of the pin is computed on read, not stored. Consistent, but see API finding B5. | P1 (with B5) |
| D7 | Interactive transactions run through the Supabase pooler. Working in production; a long transaction (many lines) is bounded by Prisma's 5 s default and would surface as 503. | Potential |
| D8 | Deadlock risk from unordered stock updates (API finding B8). | P2 (potential) |

## Money

All amounts are whole-QAR integers (`Int`). No floating-point arithmetic, no rounding, no currency conversion and no
discount arithmetic exist anywhere on the order path. `compareAtPriceQar` is display-only. This representation is
safe; no change is recommended.

## Migration safety

All six production migrations are additive. None rewrites or deletes data. Historic orders have no location row
and `deliveryChargePending = false`, which the admin shows as "Location not recorded".
