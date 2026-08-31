import { buildSortedParamString, sign } from './signature.util';

// ponytail: path versi (202309) & nama shop_cipher/query vs header wajib
// dicocokkan ke dokumen App-mu di Partner Center — API TikTok Shop di-versi
// per tanggal, tergantung scope yang di-approve untuk app kamu.
const AUTHORIZED_SHOPS_PATH = '/authorization/202309/shops';
const ORDER_SEARCH_PATH = '/order/202309/orders/search';
const ORDER_DETAIL_PATH = '/order/202309/orders';

export interface TiktokCredentials {
  shopCipher: string;
  accessToken: string;
}

function buildSignedUrl(path: string, extraParams: Record<string, string>) {
  const appKey = process.env.TIKTOK_APP_KEY ?? '';
  const appSecret = process.env.TIKTOK_APP_SECRET ?? '';
  const host = process.env.TIKTOK_HOST ?? '';

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, string> = { app_key: appKey, timestamp, ...extraParams };
  const sortedParams = buildSortedParamString(params);
  const requestSign = sign(appSecret, path, sortedParams);

  const url = new URL(host + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('sign', requestSign);
  return url;
}

function authHeaders(accessToken: string) {
  return { 'x-tts-access-token': accessToken };
}

export interface TiktokShop {
  id: string;
  cipher: string;
}

export interface TiktokAuthorizedShopsResult {
  code: number;
  message: string;
  data?: { shops: TiktokShop[] };
}

export async function getAuthorizedShops(accessToken: string): Promise<TiktokAuthorizedShopsResult> {
  const url = buildSignedUrl(AUTHORIZED_SHOPS_PATH, {});
  const res = await fetch(url.toString(), { headers: authHeaders(accessToken) });
  return (await res.json()) as TiktokAuthorizedShopsResult;
}

export interface TiktokOrderListResult {
  code: number;
  message: string;
  data?: { next_page_token?: string; orders: { id: string }[] };
}

export async function getOrderList(
  creds: TiktokCredentials,
  params: { createTimeGe: number; createTimeLt: number; pageToken?: string; pageSize?: number }
): Promise<TiktokOrderListResult> {
  const url = buildSignedUrl(ORDER_SEARCH_PATH, {
    shop_cipher: creds.shopCipher,
    page_size: String(params.pageSize ?? 50),
    ...(params.pageToken ? { page_token: params.pageToken } : {}),
  });
  const body = JSON.stringify({ create_time_ge: params.createTimeGe, create_time_lt: params.createTimeLt });
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(creds.accessToken) },
    body,
  });
  return (await res.json()) as TiktokOrderListResult;
}

export interface TiktokOrderDetail {
  id: string;
  status: string;
  payment?: { total_amount?: string };
  buyer_email?: string;
  cod?: { is_cod?: boolean };
  delivery_option_name?: string;
  line_items?: { id: string; product_name: string; sale_price?: string }[];
}

export interface TiktokOrderDetailResult {
  code: number;
  message: string;
  data?: { orders: TiktokOrderDetail[] };
}

export async function getOrderDetail(creds: TiktokCredentials, orderIds: string[]): Promise<TiktokOrderDetailResult> {
  const url = buildSignedUrl(ORDER_DETAIL_PATH, { shop_cipher: creds.shopCipher, ids: JSON.stringify(orderIds) });
  const res = await fetch(url.toString(), { headers: authHeaders(creds.accessToken) });
  return (await res.json()) as TiktokOrderDetailResult;
}
