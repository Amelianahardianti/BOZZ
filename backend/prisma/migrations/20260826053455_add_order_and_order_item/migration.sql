-- CreateTable
CREATE TABLE "Order" (
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
    "syncedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemSku" TEXT,
    "modelId" TEXT,
    "modelSku" TEXT,
    "modelQuantityPurchased" INTEGER NOT NULL,
    "modelOriginalPrice" REAL,
    "modelDiscountedPrice" REAL,
    "orderItemId" TEXT,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderSn_key" ON "Order"("orderSn");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_itemId_modelId_orderItemId_key" ON "OrderItem"("orderId", "itemId", "modelId", "orderItemId");
