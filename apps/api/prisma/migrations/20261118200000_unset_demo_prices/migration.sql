-- Owner's decision (2026-11-18): every product at the demo price of 99 QAR goes to 0 QAR, shown to customers as
-- "Price coming soon" and not orderable until the shop sets its real price. Published or not stays as it is.
-- Any "was" price on those products is cleared (a reduction from an unset price means nothing). Products with any
-- other price are not touched. updatedAt moves so the public catalogue copies refresh.
UPDATE "Product" SET "priceQar" = 0, "compareAtPriceQar" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "priceQar" = 99;
