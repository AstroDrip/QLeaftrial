-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveryLocationManual" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OrderDeliveryLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "formattedAddress" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'QA',
    "source" TEXT NOT NULL,
    "precision" TEXT NOT NULL,
    "accuracyMeters" REAL,
    "area" TEXT,
    "zone" TEXT,
    "street" TEXT,
    "building" TEXT,
    "unit" TEXT,
    "landmark" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "confirmedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderDeliveryLocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderDeliveryLocation_orderId_key" ON "OrderDeliveryLocation"("orderId");
