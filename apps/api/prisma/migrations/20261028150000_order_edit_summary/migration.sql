-- Records what the shop changed when it accepted an edited pending order (JSON list of changes).
ALTER TABLE "Order" ADD COLUMN "editSummary" TEXT;
