import { createHmac } from "crypto";
import { env } from "../../config/env";
import type { PlatformAdapter, NormalizedOrder } from "../platforms/platform-adapter.types";
import * as tiktokAuth from "./tiktok-auth.service";
import { getOrderList, getOrderDetail, type TiktokOrderDetail } from "./tiktok-api.client";

const TIKTOK_STATUS_MAP: Record<string, string> = {
  UNPAID: "new",
  ON_HOLD: "new",
  AWAITING_SHIPMENT: "processing",
  AWAITING_COLLECTION: "processing",
  PARTIALLY_SHIPPING: "shipped",
  IN_TRANSIT: "shipped",
  DELIVERED: "completed",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

function mapTiktokOrder(order: TiktokOrderDetail): NormalizedOrder {
  return {
    externalOrderId: order.id,
    status: TIKTOK_STATUS_MAP[order.status] ?? "new",
    externalStatusRaw: order.status,
    totalAmount: order.payment?.total_amount ? Number(order.payment.total_amount) : undefined,
    currency: order.payment?.currency,
    isCod: order.cod?.is_cod ?? false,
    buyerUsername: order.buyer_email,
    shippingCarrier: order.delivery_option_name,
    rawPayload: order,
    items: (order.line_items ?? []).map((item) => ({
      externalItemRef: item.id,
      itemName: item.product_name,
      qty: 1, // ponytail: TikTok line_items sudah per-unit (satu baris = satu qty) — cek ulang di payload asli
      unitPrice: item.sale_price ? Number(item.sale_price) : undefined,
      modelId: item.sku_id,
      modelSku: item.seller_sku,
    })),
  };
}

export const tiktokAdapter: PlatformAdapter = {
  name: "tiktok",

  buildAuthorizationUrl: (state) => tiktokAuth.buildAuthorizationUrl(state),

  exchangeCodeForToken: async (code) => tiktokAuth.exchangeCodeForToken(code),

  getValidAccessToken: () => tiktokAuth.getValidAccessToken(),

  fetchRecentOrders: async (creds, sinceSeconds) => {
    const createTimeLt = Math.floor(Date.now() / 1000);
    const createTimeGe = createTimeLt - sinceSeconds;
    const tiktokCreds = { shopCipher: creds.shopIdExternal, accessToken: creds.accessToken };

    const orderIds: string[] = [];
    let pageToken: string | undefined;
    do {
      const listResult = await getOrderList(tiktokCreds, { createTimeGe, createTimeLt, pageToken });
      if (listResult.code !== 0) {
        throw new Error(`TikTok order/search error: ${listResult.code} - ${listResult.message}`);
      }
      orderIds.push(...(listResult.data?.orders.map((o) => o.id) ?? []));
      pageToken = listResult.data?.next_page_token || undefined;
    } while (pageToken);

    if (orderIds.length === 0) return [];

    const detailResult = await getOrderDetail(tiktokCreds, orderIds);
    if (detailResult.code !== 0) {
      throw new Error(`TikTok order detail error: ${detailResult.code} - ${detailResult.message}`);
    }

    return (detailResult.data?.orders ?? []).map(mapTiktokOrder);
  },

  // ponytail: header/format signature webhook di bawah ini mengikuti pola umum yang
  // terdokumentasi ("app_key + raw body", HMAC-SHA256 dengan app_secret) — cocokkan ke
  // TikTok Webhook Signature Verification Guide begitu webhook pertama diterima nyata.
  verifyWebhookSignature: (rawBody, headers) => {
    const signatureHeader = headers["authorization"];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (!signature) return false;
    const expected = createHmac("sha256", env.tiktokAppSecret).update(env.tiktokAppKey + rawBody).digest("hex");
    return signature === expected;
  },

  normalizeWebhookPayload: (payload) => {
    const body = payload as { data?: TiktokOrderDetail };
    if (!body?.data?.id) return null;
    return mapTiktokOrder(body.data);
  },
};
