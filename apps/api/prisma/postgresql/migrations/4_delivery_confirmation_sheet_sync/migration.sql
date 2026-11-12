-- Additive only: new columns with defaults or NULL, so every existing order keeps its data. Existing orders are not
-- marked as needing a delivery-charge confirmation (they were placed before the rule existed).

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "deliveryChargePending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryFeeConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "sheetSyncError" TEXT,
ADD COLUMN     "sheetSyncedAt" TIMESTAMP(3);
