import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../../db/prisma.client";
import { upsertOrders, getOrderBySn } from "./order.service";
import { app } from "../../app";
import type { ShopeeOrderDetail } from "../shopee/shopee-api.client";

/**
 * Verifies the internal order pipeline end-to-end WITHOUT calling the real Shopee API:
 * mock get_order_detail response -> order.service mapping -> Prisma -> SQLite -> REST endpoints.
 * Uses generic dummy data only (no real product/brand names).
 */

const TEST_ORDER_SN = "TESTORD0000001";

const mockOrderUnpaid: ShopeeOrderDetail = {
  order_sn: TEST_ORDER_SN,
  order_status: "UNPAID",
  region: "SG",
  currency: "SGD",
  total_amount: 150.5,
  buyer_username: "test_buyer_01",
  create_time: 1700000000,
  update_time: 1700000000,
  item_list: [
    {
      item_id: 111111,
      item_name: "Sample Product A",
      item_sku: "SKU-A",
      model_id: 0,
      model_sku: "",
      model_quantity_purchased: 2,
      model_original_price: 50,
      model_discounted_price: 45,
      order_item_id: 111111,
    },
    {
      item_id: 222222,
      item_name: "Sample Product B",
      item_sku: "SKU-B",
      model_id: 333333,
      model_sku: "SKU-B-VAR1",
      model_quantity_purchased: 1,
      model_original_price: 60.5,
      model_discounted_price: 60.5,
      order_item_id: 222222,
    },
  ],
};

// Simulates a re-sync where status changed, item A's qty changed, item B was removed,
// and a new item C appeared — exercises the delete+recreate item strategy from Step 2.
const mockOrderReadyToShip: ShopeeOrderDetail = {
  ...mockOrderUnpaid,
  order_status: "READY_TO_SHIP",
  update_time: 1700003600,
  pay_time: 1700001000,
  item_list: [
    {
      item_id: 111111,
      item_name: "Sample Product A",
      item_sku: "SKU-A",
      model_id: 0,
      model_sku: "",
      model_quantity_purchased: 3,
      model_original_price: 50,
      model_discounted_price: 45,
      order_item_id: 111111,
    },
    {
      item_id: 444444,
      item_name: "Sample Product C",
      item_sku: "SKU-C",
      model_id: 0,
      model_sku: "",
      model_quantity_purchased: 1,
      model_original_price: 20,
      model_discounted_price: 20,
      order_item_id: 444444,
    },
  ],
};

async function startTestServer() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, port };
}

after(async () => {
  await prisma.$disconnect();
});

test("0. cleanup sisa data test sebelumnya (idempotent)", async () => {
  await prisma.order.deleteMany({ where: { orderSn: TEST_ORDER_SN } });
});

test("1. Order UNPAID dapat disimpan lewat upsertOrders", async () => {
  const { created, updated } = await upsertOrders([mockOrderUnpaid]);
  assert.equal(created, 1);
  assert.equal(updated, 0);

  const saved = await getOrderBySn(TEST_ORDER_SN);
  assert.ok(saved, "order should exist after insert");
  assert.equal(saved!.orderStatus, "UNPAID");
  assert.equal(saved!.totalAmount, 150.5);
  assert.equal(saved!.buyerUsername, "test_buyer_01");
});

test("2. OrderItem tersimpan dengan benar", async () => {
  const saved = await getOrderBySn(TEST_ORDER_SN);
  assert.ok(saved);
  assert.equal(saved!.items.length, 2);

  const itemA = saved!.items.find((i) => i.itemId === "111111");
  assert.ok(itemA, "item A should exist");
  assert.equal(itemA!.itemName, "Sample Product A");
  assert.equal(itemA!.modelQuantityPurchased, 2);
  assert.equal(itemA!.modelDiscountedPrice, 45);

  const itemB = saved!.items.find((i) => i.itemId === "222222");
  assert.ok(itemB, "item B should exist");
  assert.equal(itemB!.modelSku, "SKU-B-VAR1");
});

test("3. orderSn unique — resync data identik tidak membuat duplicate row", async () => {
  await upsertOrders([mockOrderUnpaid]);
  const rows = await prisma.order.findMany({ where: { orderSn: TEST_ORDER_SN } });
  assert.equal(rows.length, 1, "must still be exactly one Order row for this orderSn");
});

test("4. Sync kedua (data berubah) melakukan UPDATE, bukan INSERT baru", async () => {
  const { created, updated } = await upsertOrders([mockOrderReadyToShip]);
  assert.equal(created, 0);
  assert.equal(updated, 1);

  const rows = await prisma.order.findMany({ where: { orderSn: TEST_ORDER_SN } });
  assert.equal(rows.length, 1, "still exactly one Order row after 2nd sync");

  const saved = await getOrderBySn(TEST_ORDER_SN);
  assert.equal(saved!.orderStatus, "READY_TO_SHIP");
  assert.equal(saved!.payTime, 1700001000);

  // item list harus tergantikan penuh: item B hilang, item C baru muncul, qty item A berubah
  assert.equal(saved!.items.length, 2);
  const itemA = saved!.items.find((i) => i.itemId === "111111");
  const itemB = saved!.items.find((i) => i.itemId === "222222");
  const itemC = saved!.items.find((i) => i.itemId === "444444");
  assert.ok(itemA);
  assert.equal(itemA!.modelQuantityPurchased, 3);
  assert.equal(itemB, undefined, "item B should have been removed on resync");
  assert.ok(itemC, "item C should be newly present");
});

test("5. GET /api/orders mengembalikan data yang benar", async () => {
  const { server, port } = await startTestServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/orders`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as Array<{ orderSn: string; orderStatus: string }>;
    const found = data.find((o) => o.orderSn === TEST_ORDER_SN);
    assert.ok(found, "test order should be present in /api/orders");
    assert.equal(found!.orderStatus, "READY_TO_SHIP");
  } finally {
    server.close();
  }
});

test("6. GET /api/orders/:orderSn mengembalikan detail dan items", async () => {
  const { server, port } = await startTestServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/orders/${TEST_ORDER_SN}`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { orderSn: string; items: unknown[] };
    assert.equal(data.orderSn, TEST_ORDER_SN);
    assert.equal(data.items.length, 2);

    const notFound = await fetch(`http://localhost:${port}/api/orders/DOES-NOT-EXIST`);
    assert.equal(notFound.status, 404);
  } finally {
    server.close();
  }
});
