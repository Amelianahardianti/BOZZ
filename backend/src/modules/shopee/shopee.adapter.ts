import type { PlatformAdapter, NormalizedOrder } from "../platforms/platform-adapter.types";
import * as shopeeAuth from "./shopee-auth.service";
import { getOrderList, getOrderDetail, type ShopeeOrderDetail } from "./shopee-api.client";

const ORDER_DETAIL_CHUNK_SIZE = 50; // limit dari get_order_detail: order_sn_list maks 50

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

// Shopee sync sedang di-hold (partner key belum tersedia) — mapping status di bawah cukup
// untuk struktur, belum divalidasi terhadap partner key nyata.
const SHOPEE_STATUS_MAP: Record<string, string> = {
  UNPAID: "new",
  READY_TO_SHIP: "processing",
  PROCESSED: "processing",
  SHIPPED: "shipped",
  TO_CONFIRM_RECEIVE: "shipped",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  IN_CANCEL: "cancelled",
  TO_RETURN: "cancelled",
};

function mapShopeeOrder(order: ShopeeOrderDetail): NormalizedOrder {
  return {
    externalOrderId: order.order_sn,
    status: SHOPEE_STATUS_MAP[order.order_status] ?? "new",
    externalStatusRaw: order.order_status,
    totalAmount: order.total_amount,
    currency: order.currency,
    isCod: false,
    buyerUsername: order.buyer_username,
    rawPayload: order,
    items: (order.item_list ?? []).map((item) => ({
      externalItemRef: String(item.item_id),
      itemName: item.item_name,
      qty: item.model_quantity_purchased,
      unitPrice: item.model_discounted_price ?? item.model_original_price,
      modelId: item.model_id !== undefined ? String(item.model_id) : undefined,
      modelSku: item.model_sku,
      orderItemId: item.order_item_id !== undefined ? String(item.order_item_id) : undefined,
    })),
  };
}

export const shopeeAdapter: PlatformAdapter = {
  name: "shopee",

  buildAuthorizationUrl: (state) => shopeeAuth.buildAuthorizationUrl(state),

  exchangeCodeForToken: async (code, shopIdExternal) => {
    if (!shopIdExternal) throw new Error("Shopee callback requires shop_id");
    return shopeeAuth.exchangeCodeForToken(code, shopIdExternal);
  },

  getValidAccessToken: () => shopeeAuth.getValidAccessToken(),

  fetchRecentOrders: async (creds, sinceSeconds) => {
    const timeTo = Math.floor(Date.now() / 1000);
    const timeFrom = timeTo - sinceSeconds;
    const shopeeCreds = { shopId: creds.shopIdExternal, accessToken: creds.accessToken };

    const orderSnList: string[] = [];
    let cursor = "";
    let more = true;
    while (more) {
      const listResult = await getOrderList(shopeeCreds, { timeFrom, timeTo, cursor });
      if (listResult.error) {
        throw new Error(`Shopee get_order_list error: ${listResult.error} - ${listResult.message}`);
      }
      const response = listResult.response;
      if (!response) break;
      orderSnList.push(...response.order_list.map((o) => o.order_sn));
      more = response.more;
      cursor = response.next_cursor;
    }

    if (orderSnList.length === 0) return [];

    const details: ShopeeOrderDetail[] = [];
    for (const batch of chunk(orderSnList, ORDER_DETAIL_CHUNK_SIZE)) {
      const detailResult = await getOrderDetail(shopeeCreds, batch);
      if (detailResult.error) {
        throw new Error(`Shopee get_order_detail error: ${detailResult.error} - ${detailResult.message}`);
      }
      if (detailResult.response) details.push(...detailResult.response.order_list);
    }

    return details.map(mapShopeeOrder);
  },

  // Webhook & update-status belum diimplementasi selama Shopee di-hold.
};
