-- Additive only: new nullable columns, and booleans with a default, so every existing product keeps its
-- data and simply gains empty details (not featured, nothing to review).

-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "careLevel" TEXT,
ADD COLUMN     "compareAtPriceQar" INTEGER,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "placement" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "scientificName" TEXT,
ADD COLUMN     "watering" TEXT,
ADD COLUMN     "wateringAr" TEXT;

-- CreateIndex
CREATE INDEX "Product_published_featured_idx" ON "public"."Product"("published", "featured");
