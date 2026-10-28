-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "category" TEXT NOT NULL,
    "categoryAr" TEXT,
    "light" TEXT,
    "lightAr" TEXT,
    "priceQar" INTEGER NOT NULL,
    "costPrice" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Product" ("category", "categoryAr", "costPrice", "createdAt", "description", "descriptionAr", "id", "light", "lightAr", "name", "nameAr", "priceQar", "published", "sku", "slug", "updatedAt") SELECT "category", "categoryAr", "costPrice", "createdAt", "description", "descriptionAr", "id", "light", "lightAr", "name", "nameAr", "priceQar", "published", "sku", "slug", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_published_category_idx" ON "Product"("published", "category");
CREATE INDEX "Product_published_priceQar_idx" ON "Product"("published", "priceQar");
CREATE INDEX "Product_published_name_idx" ON "Product"("published", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

