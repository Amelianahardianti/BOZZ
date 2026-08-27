import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../../db/prisma.client";
import { app } from "../../app";

/**
 * Verifies the MVP vertical slice business logic that is NOT Shopee-specific:
 * explicit marketplace on new orders, and the strict PENDING->PACKING->PACKED
 * fulfillment transition (rejecting invalid transitions with 409).
 */

const TOKOPEDIA_ORDER_SN = "TESTFUL-TOKOPEDIA-0001";
const OFFLINE_ORDER_SN = "TESTFUL-OFFLINE-0001";

async function startTestServer() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, port };
}

async function seedOrder(orderSn: string, marketplace: string) {
  await prisma.order.create({
    data: {
      orderSn,
      marketplace,
      orderStatus: "UNPAID",
      totalAmount: 10000,
      buyerUsername: "test_buyer",
      items: {
        create: [
          {
            itemId: "ITEM-1",
            itemName: "Produk Umum Test",
            itemSku: "SKU-TEST",
            modelQuantityPurchased: 1,
            modelOriginalPrice: 10000,
          },
        ],
      },
    },
  });
}

after(async () => {
  await prisma.order.deleteMany({ where: { orderSn: { in: [TOKOPEDIA_ORDER_SN, OFFLINE_ORDER_SN] } } });
  await prisma.$disconnect();
});

test("0. cleanup sisa data test sebelumnya (idempotent)", async () => {
  await prisma.order.deleteMany({ where: { orderSn: { in: [TOKOPEDIA_ORDER_SN, OFFLINE_ORDER_SN] } } });
});

test("1. Order baru wajib punya marketplace eksplisit (TOKOPEDIA, bukan default SHOPEE)", async () => {
  await seedOrder(TOKOPEDIA_ORDER_SN, "TOKOPEDIA");
  const order = await prisma.order.findUnique({ where: { orderSn: TOKOPEDIA_ORDER_SN } });
  assert.ok(order);
  assert.equal(order!.marketplace, "TOKOPEDIA");
  assert.equal(order!.fulfillmentStatus, "PENDING", "new order defaults to PENDING");
});

test("2. Order OFFLINE tersimpan dengan marketplace OFFLINE", async () => {
  await seedOrder(OFFLINE_ORDER_SN, "OFFLINE");
  const order = await prisma.order.findUnique({ where: { orderSn: OFFLINE_ORDER_SN } });
  assert.equal(order!.marketplace, "OFFLINE");
});

test("3. POST send-to-packer: PENDING -> PACKING berhasil (200)", async () => {
  const { server, port } = await startTestServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/orders/${TOKOPEDIA_ORDER_SN}/send-to-packer`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { fulfillmentStatus: string };
    assert.equal(data.fulfillmentStatus, "PACKING");
  } finally {
    server.close();
  }
});

test("4. POST send-to-packer lagi pada order yang sudah PACKING ditolak 409", async () => {
  const { server, port } = await startTestServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/orders/${TOKOPEDIA_ORDER_SN}/send-to-packer`, {
      method: "POST",
    });
    assert.equal(res.status, 409);
  } finally {
    server.close();
  }
});

test("5. POST mark-packed pada order yang masih PENDING (skip step) ditolak 409", async () => {
  const { server, port } = await startTestServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/orders/${OFFLINE_ORDER_SN}/mark-packed`, {
      method: "POST",
    });
    assert.equal(res.status, 409);
  } finally {
    server.close();
  }
});

test("6. POST mark-packed: PACKING -> PACKED berhasil (200)", async () => {
  const { server, port } = await startTestServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/orders/${TOKOPEDIA_ORDER_SN}/mark-packed`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { fulfillmentStatus: string };
    assert.equal(data.fulfillmentStatus, "PACKED");
  } finally {
    server.close();
  }
});

test("7. POST mark-packed lagi pada order yang sudah PACKED ditolak 409", async () => {
  const { server, port } = await startTestServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/orders/${TOKOPEDIA_ORDER_SN}/mark-packed`, {
      method: "POST",
    });
    assert.equal(res.status, 409);
  } finally {
    server.close();
  }
});

test("8. GET /api/orders?fulfillmentStatus=PACKING hanya mengembalikan order PACKING", async () => {
  await seedOrder(OFFLINE_ORDER_SN + "-B", "OFFLINE"); // extra PENDING order, should NOT appear
  await prisma.order.update({ where: { orderSn: OFFLINE_ORDER_SN }, data: { fulfillmentStatus: "PACKING" } });

  const { server, port } = await startTestServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/orders?fulfillmentStatus=PACKING`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as Array<{ orderSn: string; fulfillmentStatus: string }>;
    assert.ok(data.every((o) => o.fulfillmentStatus === "PACKING"));
    assert.ok(data.some((o) => o.orderSn === OFFLINE_ORDER_SN));
    assert.ok(!data.some((o) => o.orderSn === OFFLINE_ORDER_SN + "-B"));
  } finally {
    server.close();
    await prisma.order.deleteMany({ where: { orderSn: OFFLINE_ORDER_SN + "-B" } });
  }
});

test("9. POST send-to-packer pada orderSn yang tidak ada mengembalikan 404", async () => {
  const { server, port } = await startTestServer();
  try {
    const res = await fetch(`http://localhost:${port}/api/orders/DOES-NOT-EXIST/send-to-packer`, {
      method: "POST",
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
