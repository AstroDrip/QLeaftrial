-- Additive only: a nullable column and a unique index. Existing orders keep NULL, which the unique
-- index allows any number of times.

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "public"."Order"("idempotencyKey");
