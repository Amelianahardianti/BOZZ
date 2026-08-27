import { prisma } from "../../db/prisma.client";

/**
 * Seeds generic mock orders across marketplaces for the MVP vertical slice demo.
 * Run manually: `npx tsx src/modules/order/mock-orders.seed.ts` (or `npm run seed`).
 * Uses generic product names only — no real brand names.
 */

const now = Math.floor(Date.now() / 1000);
const HOUR = 60 * 60;

interface MockOrder {
  orderSn: string;
  marketplace: "SHOPEE" | "TOKOPEDIA" | "OFFLINE";
  orderStatus: string;
  fulfillmentStatus: "PENDING" | "PACKING" | "PACKED";
  totalAmount: number;
  buyerUsername: string;
  orderCreateTime: number; // unix seconds — older values simulate "urgent" orders
  items: { itemId: string; itemName: string; itemSku: string; qty: number; price: number }[];
}

const mockOrders: MockOrder[] = [
  {
    orderSn: "MOCK-SHOPEE-0001",
    marketplace: "SHOPEE",
    orderStatus: "UNPAID",
    fulfillmentStatus: "PENDING",
    totalAmount: 125000,
    buyerUsername: "buyer_shopee_01",
    orderCreateTime: now - 30 * HOUR, // >24h old -> should show as urgent/priority
    items: [{ itemId: "SHP-ITEM-001", itemName: "Produk Umum A", itemSku: "SKU-A", qty: 2, price: 62500 }],
  },
  {
    orderSn: "MOCK-TOKOPEDIA-0001",
    marketplace: "TOKOPEDIA",
    orderStatus: "UNPAID",
    fulfillmentStatus: "PENDING",
    totalAmount: 89000,
    buyerUsername: "buyer_tokopedia_01",
    orderCreateTime: now - 2 * HOUR, // recent -> not urgent
    items: [{ itemId: "TKP-ITEM-001", itemName: "Produk Umum B", itemSku: "SKU-B", qty: 1, price: 89000 }],
  },
  {
    orderSn: "MOCK-TOKOPEDIA-0002",
    marketplace: "TOKOPEDIA",
    orderStatus: "PROCESSED",
    fulfillmentStatus: "PACKING",
    totalAmount: 154000,
    buyerUsername: "buyer_tokopedia_02",
    orderCreateTime: now - 5 * HOUR,
    items: [
      { itemId: "TKP-ITEM-002", itemName: "Produk Umum C", itemSku: "SKU-C", qty: 2, price: 45000 },
      { itemId: "TKP-ITEM-003", itemName: "Produk Umum D", itemSku: "SKU-D", qty: 1, price: 64000 },
    ],
  },
  {
    orderSn: "MOCK-OFFLINE-0001",
    marketplace: "OFFLINE",
    orderStatus: "COMPLETED",
    fulfillmentStatus: "PACKED",
    totalAmount: 50000,
    buyerUsername: "walk_in_customer",
    orderCreateTime: now - 1 * HOUR,
    items: [{ itemId: "OFF-ITEM-001", itemName: "Produk Umum E", itemSku: "SKU-E", qty: 1, price: 50000 }],
  },
  {
    orderSn: "MOCK-OFFLINE-0002",
    marketplace: "OFFLINE",
    orderStatus: "UNPAID",
    fulfillmentStatus: "PENDING",
    totalAmount: 72000,
    buyerUsername: "walk_in_customer",
    orderCreateTime: now - 26 * HOUR, // >24h old -> urgent/priority
    items: [{ itemId: "OFF-ITEM-002", itemName: "Produk Umum F", itemSku: "SKU-F", qty: 3, price: 24000 }],
  },
];

async function main() {
  for (const mock of mockOrders) {
    await prisma.order.upsert({
      where: { orderSn: mock.orderSn },
      update: {},
      create: {
        orderSn: mock.orderSn,
        marketplace: mock.marketplace,
        orderStatus: mock.orderStatus,
        fulfillmentStatus: mock.fulfillmentStatus,
        totalAmount: mock.totalAmount,
        buyerUsername: mock.buyerUsername,
        orderCreateTime: mock.orderCreateTime,
        items: {
          create: mock.items.map((item) => ({
            itemId: item.itemId,
            itemName: item.itemName,
            itemSku: item.itemSku,
            modelQuantityPurchased: item.qty,
            modelOriginalPrice: item.price,
            modelDiscountedPrice: item.price,
          })),
        },
      },
    });
  }
  console.log(`Seeded ${mockOrders.length} mock orders.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
