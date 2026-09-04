PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

DROP TABLE "ArAsset";

CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "light" TEXT NOT NULL,
    "priceQar" INTEGER NOT NULL,
    "costPrice" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Product" (
    "id",
    "slug",
    "sku",
    "name",
    "description",
    "category",
    "light",
    "priceQar",
    "costPrice",
    "published",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "slug",
    "sku",
    "name",
    "description",
    "category",
    "light",
    "priceQar",
    "costPrice",
    "published",
    "createdAt",
    "updatedAt"
FROM "Product";

DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";

CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
