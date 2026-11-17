-- AlterTable
ALTER TABLE "ProductMedia" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "ProductMedia" ADD COLUMN "photoKey" TEXT;

-- CreateIndex
CREATE INDEX "ProductMedia_productId_photoKey_idx" ON "ProductMedia"("productId", "photoKey");

