-- AlterTable
ALTER TABLE "Order" ADD COLUMN "requestFingerprint" TEXT;

-- AlterTable
ALTER TABLE "NotificationOutbox" ADD COLUMN "leaseExpiresAt" DATETIME;

