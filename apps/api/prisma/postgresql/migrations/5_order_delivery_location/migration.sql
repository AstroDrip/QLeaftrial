-- Additive only: one new table and one boolean with a default. Existing orders are untouched and simply have no
-- recorded location.

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "deliveryLocationManual" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."OrderDeliveryLocation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'QA',
    "source" TEXT NOT NULL,
    "precision" TEXT NOT NULL,
    "accuracyMeters" DOUBLE PRECISION,
    "area" TEXT,
    "zone" TEXT,
    "street" TEXT,
    "building" TEXT,
    "unit" TEXT,
    "landmark" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDeliveryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderDeliveryLocation_orderId_key" ON "public"."OrderDeliveryLocation"("orderId");

-- AddForeignKey
ALTER TABLE "public"."OrderDeliveryLocation" ADD CONSTRAINT "OrderDeliveryLocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
