-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "vendorItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "salesLast30Days" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Inventory" ("id", "productId", "quantity", "updatedAt", "vendorItemId") SELECT "id", "productId", "quantity", "updatedAt", "vendorItemId" FROM "Inventory";
DROP TABLE "Inventory";
ALTER TABLE "new_Inventory" RENAME TO "Inventory";
CREATE UNIQUE INDEX "Inventory_productId_key" ON "Inventory"("productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
