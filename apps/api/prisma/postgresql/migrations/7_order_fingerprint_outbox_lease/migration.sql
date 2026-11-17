-- Additive only: two optional columns. Existing rows are untouched.
-- Order.requestFingerprint lets the API refuse an idempotency key reused with a different order request.
-- NotificationOutbox.leaseExpiresAt lets a background worker recover rows left by a worker that stopped.

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "requestFingerprint" TEXT;

-- AlterTable
ALTER TABLE "public"."NotificationOutbox" ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3);

