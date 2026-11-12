-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryChargePending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "deliveryFeeConfirmedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "sheetSyncError" TEXT;
ALTER TABLE "Order" ADD COLUMN "sheetSyncedAt" DATETIME;
