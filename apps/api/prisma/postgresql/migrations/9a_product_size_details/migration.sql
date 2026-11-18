-- Additive only: optional size and delivery details for outdoor and large plants. Existing products keep their
-- data; the new items stay empty until the shop fills them in.
ALTER TABLE "public"."Product" ADD COLUMN "heightCm" INTEGER,
ADD COLUMN "sizeNote" TEXT,
ADD COLUMN "sizeNoteAr" TEXT,
ADD COLUMN "potIncluded" BOOLEAN,
ADD COLUMN "handlingNote" TEXT,
ADD COLUMN "handlingNoteAr" TEXT;
