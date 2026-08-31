import { buildPublicApiBaseString, sign } from './signature.util';
import { getDecryptedToken, upsertPlatformToken } from '../../repository';

const PLATFORM_NAME = 'shopee';
const GET_ACCESS_TOKEN_PATH = '/api/v2/auth/token/get';
const REFRESH_ACCESS_TOKEN_PATH = '/api/v2/auth/access_token/get';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface GetAccessTokenResponse {
  error: string;
  message: string;
  access_token?: string;
  refresh_token?: string;
  expire_in?: number;
}

export function buildAuthorizationUrl(state?: string): string {
  const url = new URL(process.env.SHOPEE_AUTH_HOST ?? '');
  url.searchParams.set('partner_id', process.env.SHOPEE_PARTNER_ID ?? '');
  url.searchParams.set('auth_type', 'seller');
  url.searchParams.set('redirect_uri', process.env.SHOPEE_REDIRECT_URI ?? '');
  url.searchParams.set('response_type', 'code');
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCodeForToken(code: string, shopId: string) {
  const partnerId = process.env.SHOPEE_PARTNER_ID ?? '';
  const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? '';
  const host = process.env.SHOPEE_HOST ?? '';

  const timestamp = Math.floor(Date.now() / 1000);
  const requestSign = sign(buildPublicApiBaseString(partnerId, GET_ACCESS_TOKEN_PATH, timestamp), partnerKey);

  const url = new URL(host + GET_ACCESS_TOKEN_PATH);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', requestSign);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(partnerId) }),
  });
  const data = (await res.json()) as GetAccessTokenResponse;

  if (data.error) throw new Error(`Shopee GetAccessToken error: ${data.error} - ${data.message}`);
  if (!data.access_token || !data.refresh_token || !data.expire_in) {
    throw new Error('Shopee GetAccessToken response tidak lengkap');
  }

  const expiresAt = new Date(Date.now() + data.expire_in * 1000);
  await upsertPlatformToken(PLATFORM_NAME, {
    shopIdExternal: shopId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  });
  return { shopIdExternal: shopId, expiresAt };
}

async function refreshAccessToken(shopId: string, refreshToken: string) {
  const partnerId = process.env.SHOPEE_PARTNER_ID ?? '';
  const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? '';
  const host = process.env.SHOPEE_HOST ?? '';

  const timestamp = Math.floor(Date.now() / 1000);
  const requestSign = sign(buildPublicApiBaseString(partnerId, REFRESH_ACCESS_TOKEN_PATH, timestamp), partnerKey);

  const url = new URL(host + REFRESH_ACCESS_TOKEN_PATH);
  url.searchParams.set('partner_id', partnerId);
  url.searchParams.set('timestamp', String(timestamp));
  url.searchParams.set('sign', requestSign);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken, shop_id: Number(shopId), partner_id: Number(partnerId) }),
  });
  const data = (await res.json()) as GetAccessTokenResponse;

  if (data.error) throw new Error(`Shopee RefreshAccessToken error: ${data.error} - ${data.message}`);
  if (!data.access_token || !data.refresh_token || !data.expire_in) {
    throw new Error('Shopee RefreshAccessToken response tidak lengkap');
  }

  const expiresAt = new Date(Date.now() + data.expire_in * 1000);
  await upsertPlatformToken(PLATFORM_NAME, {
    shopIdExternal: shopId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  });
  return { shopIdExternal: shopId, accessToken: data.access_token };
}

export async function getValidAccessToken() {
  const token = await getDecryptedToken(PLATFORM_NAME);
  if (!token) throw new Error('Belum ada toko Shopee terhubung — authorize via /api/platforms/shopee/connect dulu');

  const isExpiringSoon = token.expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;
  if (!isExpiringSoon) return { shopIdExternal: token.shopIdExternal, accessToken: token.accessToken };
  return refreshAccessToken(token.shopIdExternal, token.refreshToken);
}
