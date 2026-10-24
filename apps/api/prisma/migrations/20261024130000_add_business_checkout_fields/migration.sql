ALTER TABLE "StoreSettings" ADD COLUMN "commercialRegistration" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "ecommerceLicense" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "businessAddress" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "supportEmail" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "supportPhone" TEXT;
ALTER TABLE "StoreSettings" ADD COLUMN "deliveryFeeQar" INTEGER;
ALTER TABLE "Order" ADD COLUMN "deliveryFeeQar" INTEGER NOT NULL DEFAULT 0;
