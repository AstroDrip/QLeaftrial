-- Additive only: one nullable column and two new tables. Existing orders are untouched.
-- AdminAuditLog records who changed an order's status, payment or delivery charge.
-- NotificationOutbox holds notifications (the admin's new-order email) until they are delivered.

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "deliveryFeeConfirmedBy" TEXT;

-- CreateTable
CREATE TABLE "public"."AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "adminName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "orderId" TEXT,
    "orderNumber" TEXT,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationOutbox" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_orderId_idx" ON "public"."AdminAuditLog"("orderId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_orderNumber_idx" ON "public"."AdminAuditLog"("orderNumber");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "public"."AdminAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "public"."NotificationOutbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_nextAttemptAt_idx" ON "public"."NotificationOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_orderId_idx" ON "public"."NotificationOutbox"("orderId");

-- AddForeignKey
ALTER TABLE "public"."NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

