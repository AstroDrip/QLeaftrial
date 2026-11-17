-- Additive only: optional size and delivery details for outdoor and large plants. Existing products keep their
-- data; the new items stay empty until the shop fills them in.
ALTER TABLE "Product" ADD COLUMN "heightCm" INTEGER;
ALTER TABLE "Product" ADD COLUMN "sizeNote" TEXT;
ALTER TABLE "Product" ADD COLUMN "sizeNoteAr" TEXT;
ALTER TABLE "Product" ADD COLUMN "potIncluded" BOOLEAN;
ALTER TABLE "Product" ADD COLUMN "handlingNote" TEXT;
ALTER TABLE "Product" ADD COLUMN "handlingNoteAr" TEXT;
