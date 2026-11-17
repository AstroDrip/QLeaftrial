-- Additive only: optional plant care details (English and Arabic). Existing products keep their data; the
-- new items stay empty until the shop fills them in, and empty items are not shown.
ALTER TABLE "Product" ADD COLUMN "humidity" TEXT;
ALTER TABLE "Product" ADD COLUMN "humidityAr" TEXT;
ALTER TABLE "Product" ADD COLUMN "soil" TEXT;
ALTER TABLE "Product" ADD COLUMN "soilAr" TEXT;
ALTER TABLE "Product" ADD COLUMN "temperature" TEXT;
ALTER TABLE "Product" ADD COLUMN "temperatureAr" TEXT;
