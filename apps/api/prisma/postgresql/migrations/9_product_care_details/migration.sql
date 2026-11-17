-- Additive only: optional plant care details (English and Arabic). Existing products keep their data; the
-- new items stay empty until the shop fills them in, and empty items are not shown.
ALTER TABLE "public"."Product" ADD COLUMN "humidity" TEXT,
ADD COLUMN "humidityAr" TEXT,
ADD COLUMN "soil" TEXT,
ADD COLUMN "soilAr" TEXT,
ADD COLUMN "temperature" TEXT,
ADD COLUMN "temperatureAr" TEXT;
