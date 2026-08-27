/*
  Warnings:

  - Added the required column `marketplace` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderSn" TEXT NOT NULL,
    "orderStatus" TEXT NOT NULL,
    "region" TEXT,
    "currency" TEXT,
    "totalAmount" REAL,
    "buyerUsername" TEXT,
    "orderCreateTime" INTEGER,
    "orderUpdateTime" INTEGER,
    "payTime" INTEGER,
    "marketplace" TEXT NOT NULL,
    "fulfillmentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "syncedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Order" ("buyerUsername", "createdAt", "currency", "id", "orderCreateTime", "orderSn", "orderStatus", "orderUpdateTime", "payTime", "region", "syncedAt", "totalAmount") SELECT "buyerUsername", "createdAt", "currency", "id", "orderCreateTime", "orderSn", "orderStatus", "orderUpdateTime", "payTime", "region", "syncedAt", "totalAmount" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderSn_key" ON "Order"("orderSn");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
