import { prisma } from "../../db/prisma.client";
import type { ShopeeOrderDetail } from "../shopee/shopee-api.client";

export const FULFILLMENT_STATUSES = ["PENDING", "PACKING", "PACKED"] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

// Alur diperbolehkan strictly: PENDING -> PACKING -> PACKED. Semua transisi lain ditolak.
const ALLOWED_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus> = {
  PENDING: "PACKING",
  PACKING: "PACKED",
  PACKED: "PACKED", // tidak ada transisi lanjutan dari PACKED
};

export class InvalidTransitionError extends Error {}
export class OrderNotFoundError extends Error {}

export interface OrderFilters {
  orderStatus?: string;
  fulfillmentStatus?: string;
}

export async function listOrders(filters: OrderFilters = {}) {
  return prisma.order.findMany({
    where: {
      orderStatus: filters.orderStatus,
      fulfillmentStatus: filters.fulfillmentStatus,
    },
    include: { items: true },
    orderBy: { id: "desc" },
  });
}

export async function getOrderBySn(orderSn: string) {
  return prisma.order.findUnique({
    where: { orderSn },
    include: { items: true },
  });
}

/**
 * Moves an order strictly from PENDING->PACKING or PACKING->PACKED (per adjustment #3).
 * Throws OrderNotFoundError if the order doesn't exist, InvalidTransitionError if the
 * order's current fulfillmentStatus doesn't match `from`.
 */
export async function transitionFulfillmentStatus(orderSn: string, from: FulfillmentStatus) {
  const order = await prisma.order.findUnique({ where: { orderSn } });
  if (!order) {
    throw new OrderNotFoundError(`order ${orderSn} not found`);
  }

  const currentStatus = order.fulfillmentStatus as FulfillmentStatus;
  const expectedNext = ALLOWED_TRANSITIONS[from];

  if (currentStatus !== from) {
    throw new InvalidTransitionError(
      `cannot transition order from current status "${currentStatus}" using "${from} -> ${expectedNext}" — expected current status to be "${from}"`
    );
  }

  return prisma.order.update({
    where: { orderSn },
    data: { fulfillmentStatus: expectedNext },
    include: { items: true },
  });
}

/**
 * Upserts orders from get_order_detail into the DB. Order is matched/deduplicated by the
 * unique `orderSn`; its items are replaced (delete + recreate) on every sync — see Step 2
 * design point 7 for why this is simpler and safer than per-item upsert for a PoC.
 */
export async function upsertOrders(orders: ShopeeOrderDetail[]) {
  let created = 0;
  let updated = 0;

  for (const order of orders) {
    const exists = await prisma.order.findUnique({ where: { orderSn: order.order_sn } });

    await prisma.$transaction(async (tx) => {
      const savedOrder = await tx.order.upsert({
        where: { orderSn: order.order_sn },
        update: {
          orderStatus: order.order_status,
          region: order.region,
          currency: order.currency,
          totalAmount: order.total_amount,
          buyerUsername: order.buyer_username,
          orderCreateTime: order.create_time,
          orderUpdateTime: order.update_time,
          payTime: order.pay_time,
        },
        create: {
          orderSn: order.order_sn,
          orderStatus: order.order_status,
          region: order.region,
          currency: order.currency,
          totalAmount: order.total_amount,
          buyerUsername: order.buyer_username,
          orderCreateTime: order.create_time,
          orderUpdateTime: order.update_time,
          payTime: order.pay_time,
          marketplace: "SHOPEE", // set eksplisit — orderSn dari Shopee sync selalu marketplace Shopee
        },
      });

      await tx.orderItem.deleteMany({ where: { orderId: savedOrder.id } });

      if (order.item_list?.length) {
        await tx.orderItem.createMany({
          data: order.item_list.map((item) => ({
            orderId: savedOrder.id,
            itemId: String(item.item_id),
            itemName: item.item_name,
            itemSku: item.item_sku,
            modelId: item.model_id !== undefined ? String(item.model_id) : undefined,
            modelSku: item.model_sku,
            modelQuantityPurchased: item.model_quantity_purchased,
            modelOriginalPrice: item.model_original_price,
            modelDiscountedPrice: item.model_discounted_price,
            orderItemId: item.order_item_id !== undefined ? String(item.order_item_id) : undefined,
          })),
        });
      }
    });

    if (exists) updated++;
    else created++;
  }

  return { created, updated };
}
