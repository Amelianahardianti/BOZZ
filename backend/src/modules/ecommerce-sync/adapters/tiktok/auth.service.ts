import { getDecryptedToken, upsertPlatformToken } from '../../repository';
import { getAuthorizedShops } from './api.client';

const PLATFORM_NAME = 'tiktok';
const TOKEN_GET_PATH = '/api/v2/token/get';
const TOKEN_REFRESH_PATH = '/api/v2/token/refresh';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface TokenResponse {
  code: number;
  message: string;
  data?: {
    access_token: string;
    access_token_expire_in: number;
    refresh_token: string;
    refresh_token_expire_in: number;
    open_id: string;
  };
}

/** Link authorize dari App milikmu di Partner Center — isi TIKTOK_AUTH_HOST di .env. */
export function buildAuthorizationUrl(state?: string): string {
  const url = new URL(process.env.TIKTOK_AUTH_HOST ?? '');
  url.searchParams.set('service_id', process.env.TIKTOK_SERVICE_ID ?? '');
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCodeForToken(authCode: string) {
  const appKey = process.env.TIKTOK_APP_KEY ?? '';
  const appSecret = process.env.TIKTOK_APP_SECRET ?? '';
  const host = process.env.TIKTOK_HOST ?? '';

  const url = new URL(host + TOKEN_GET_PATH);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('app_secret', appSecret);
  url.searchParams.set('auth_code', authCode);
  url.searchParams.set('grant_type', 'authorized_code');

  const res = await fetch(url.toString());
  const data = (await res.json()) as TokenResponse;
  if (!data.data) throw new Error(`TikTok token/get error: ${data.code} - ${data.message}`);

  const shopsResult = await getAuthorizedShops(data.data.access_token);
  const shop = shopsResult.data?.shops[0];
  if (!shop) throw new Error('Otorisasi TikTok berhasil tapi tidak ada toko yang dikembalikan');

  const expiresAt = new Date(Date.now() + data.data.access_token_expire_in * 1000);
  await upsertPlatformToken(PLATFORM_NAME, {
    shopIdExternal: shop.cipher,
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    expiresAt,
  });
  return { shopIdExternal: shop.cipher, expiresAt };
}

async function refreshAccessToken(refreshToken: string) {
  const appKey = process.env.TIKTOK_APP_KEY ?? '';
  const appSecret = process.env.TIKTOK_APP_SECRET ?? '';
  const host = process.env.TIKTOK_HOST ?? '';

  const url = new URL(host + TOKEN_REFRESH_PATH);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('app_secret', appSecret);
  url.searchParams.set('refresh_token', refreshToken);
  url.searchParams.set('grant_type', 'refresh_token');

  const res = await fetch(url.toString());
  const data = (await res.json()) as TokenResponse;
  if (!data.data) throw new Error(`TikTok token/refresh error: ${data.code} - ${data.message}`);

  const existing = await getDecryptedToken(PLATFORM_NAME);
  const expiresAt = new Date(Date.now() + data.data.access_token_expire_in * 1000);
  await upsertPlatformToken(PLATFORM_NAME, {
    shopIdExternal: existing?.shopIdExternal ?? '',
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    expiresAt,
  });
  return { shopIdExternal: existing?.shopIdExternal ?? '', accessToken: data.data.access_token };
}

export async function getValidAccessToken() {
  const token = await getDecryptedToken(PLATFORM_NAME);
  if (!token) throw new Error('Belum ada toko TikTok terhubung — authorize via /api/platforms/tiktok/connect dulu');

  const isExpiringSoon = token.expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;
  if (!isExpiringSoon) return { shopIdExternal: token.shopIdExternal, accessToken: token.accessToken };
  return refreshAccessToken(token.refreshToken);
}
