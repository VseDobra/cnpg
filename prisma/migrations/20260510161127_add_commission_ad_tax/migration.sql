-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "salePrice" INTEGER NOT NULL,
    "costPrice" INTEGER NOT NULL DEFAULT 0,
    "couponDiscount" INTEGER NOT NULL DEFAULT 0,
    "commission" REAL NOT NULL DEFAULT 10.8,
    "adRate" REAL NOT NULL DEFAULT 5.0,
    "taxRate" REAL NOT NULL DEFAULT 10.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "imageUrl" TEXT
);
INSERT INTO "new_Product" ("costPrice", "couponDiscount", "createdAt", "id", "imageUrl", "name", "salePrice", "status", "updatedAt") SELECT "costPrice", "couponDiscount", "createdAt", "id", "imageUrl", "name", "salePrice", "status", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
