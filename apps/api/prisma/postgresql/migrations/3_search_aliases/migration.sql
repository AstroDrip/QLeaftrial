-- Additive only: one new nullable column for admin-maintained search words.

-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "searchAliases" TEXT;
