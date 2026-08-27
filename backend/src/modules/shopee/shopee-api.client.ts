import { env } from "../../config/env";
import { buildShopApiBaseString, sign } from "./shopee-signature.util";

const GET_ORDER_LIST_PATH = "/api/v2/order/get_order_list";
const GET_ORDER_DETAIL_PATH = "/api/v2/order/get_order_detail";

interface ShopeeCredentials {
  shopId: string;
  accessToken: string;
}

function buildSignedUrl(path: string, creds: ShopeeCredentials, extraParams: Record<string, string>) {
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = buildShopApiBaseString(
    env.shopeePartnerId,
    path,
    timestamp,
    creds.accessToken,
    creds.shopId
  );
  const requestSign = sign(baseString, env.shopeePartnerKey);

  const url = new URL(env.shopeeHost + path);
  url.searchParams.set("partner_id", env.shopeePartnerId);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("access_token", creds.accessToken);
  url.searchParams.set("shop_id", creds.shopId);
  url.searchParams.set("sign", requestSign);
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }
  return url;
}

// --- v2.order.get_order_list ---

export interface GetOrderListResult {
  request_id: string;
  error: string;
  message: string;
  response?: {
    more: boolean;
    next_cursor: string;
    order_list: { order_sn: string; order_status?: string }[];
  };
}

export async function getOrderList(
  creds: ShopeeCredentials,
  params: { timeFrom: number; timeTo: number; cursor?: string; pageSize?: number }
): Promise<GetOrderListResult> {
  const url = buildSignedUrl(GET_ORDER_LIST_PATH, creds, {
    time_range_field: "create_time",
    time_from: String(params.timeFrom),
    time_to: String(params.timeTo),
    page_size: String(params.pageSize ?? 50),
    cursor: params.cursor ?? "",
  });

  const res = await fetch(url.toString());
  return (await res.json()) as GetOrderListResult;
}

// --- v2.order.get_order_detail ---

export interface ShopeeOrderItem {
  item_id: number;
  item_name: string;
  item_sku?: string;
  model_id?: number;
  model_sku?: string;
  model_quantity_purchased: number;
  model_original_price?: number;
  model_discounted_price?: number;
  order_item_id?: number;
}

export interface ShopeeOrderDetail {
  order_sn: string;
  order_status: string;
  region?: string;
  currency?: string;
  total_amount?: number;
  buyer_username?: string;
  create_time?: number;
  update_time?: number;
  pay_time?: number;
  item_list?: ShopeeOrderItem[];
}

export interface GetOrderDetailResult {
  request_id: string;
  error: string;
  message: string;
  response?: {
    order_list: ShopeeOrderDetail[];
  };
}

const ORDER_DETAIL_RESPONSE_FIELDS = ["item_list", "total_amount", "buyer_username", "pay_time"].join(",");

export async function getOrderDetail(
  creds: ShopeeCredentials,
  orderSnList: string[]
): Promise<GetOrderDetailResult> {
  const url = buildSignedUrl(GET_ORDER_DETAIL_PATH, creds, {
    order_sn_list: orderSnList.join(","),
    response_optional_fields: ORDER_DETAIL_RESPONSE_FIELDS,
  });

  const res = await fetch(url.toString());
  return (await res.json()) as GetOrderDetailResult;
}
