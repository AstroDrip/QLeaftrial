-- Additive only: two optional columns and one index on ProductMedia. Existing rows are untouched; photos saved
-- before photoKey existed keep being paired by sort order.

-- AlterTable
ALTER TABLE "public"."ProductMedia" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "photoKey" TEXT;

-- CreateIndex
CREATE INDEX "ProductMedia_productId_photoKey_idx" ON "public"."ProductMedia"("productId", "photoKey");

