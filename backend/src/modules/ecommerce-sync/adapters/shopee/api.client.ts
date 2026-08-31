import { buildShopApiBaseString, sign } from './signature.util';

const GET_ORDER_LIST_PATH = '/api/v2/order/get_order_list';
const GET_ORDER_DETAIL_PATH = '/api/v2/order/get_order_detail';

interface ShopeeCredentials {
  shopId: string;
  accessToken: string;
}

function buildSignedUrl(path: string, creds: ShopeeCredentials, extraParams: Record<string, string>) {
  const partnerId = process.env.SHOPEE_PARTNER_ID ?? '';
  const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? '';
  const host = process.env.SHOPEE_HOST ?? '';

  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = buildShopApiBaseString(partnerId, path, timestamp, creds.accessToken, creds.shopId);
  const requestSign = sign(baseString, partnerKey);

  const url = new URL(host + path);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('access_token', creds.accessToken);
  url.searchParams.set('shop_id', creds.shopId);
  url.searchParams.set('sign', requestSign);
  for (const [key, value] of Object.entries(extraParams)) url.searchParams.set(key, value);
  return url;
}

export interface GetOrderListResult {
  request_id: string;
  error: string;
  message: string;
  response?: { more: boolean; next_cursor: string; order_list: { order_sn: string }[] };
}

export async function getOrderList(
  creds: ShopeeCredentials,
  params: { timeFrom: number; timeTo: number; cursor?: string; pageSize?: number }
): Promise<GetOrderListResult> {
  const url = buildSignedUrl(GET_ORDER_LIST_PATH, creds, {
    time_range_field: 'create_time',
    time_from: String(params.timeFrom),
    time_to: String(params.timeTo),
    page_size: String(params.pageSize ?? 50),
    cursor: params.cursor ?? '',
  });
  const res = await fetch(url.toString());
  return (await res.json()) as GetOrderListResult;
}

export interface ShopeeOrderItem {
  item_id: number;
  item_name: string;
  model_quantity_purchased: number;
  model_original_price?: number;
  model_discounted_price?: number;
}

export interface ShopeeOrderDetail {
  order_sn: string;
  order_status: string;
  total_amount?: number;
  buyer_username?: string;
  item_list?: ShopeeOrderItem[];
}

export interface GetOrderDetailResult {
  request_id: string;
  error: string;
  message: string;
  response?: { order_list: ShopeeOrderDetail[] };
}

const ORDER_DETAIL_RESPONSE_FIELDS = ['item_list', 'total_amount', 'buyer_username'].join(',');

export async function getOrderDetail(creds: ShopeeCredentials, orderSnList: string[]): Promise<GetOrderDetailResult> {
  const url = buildSignedUrl(GET_ORDER_DETAIL_PATH, creds, {
    order_sn_list: orderSnList.join(','),
    response_optional_fields: ORDER_DETAIL_RESPONSE_FIELDS,
  });
  const res = await fetch(url.toString());
  return (await res.json()) as GetOrderDetailResult;
}
