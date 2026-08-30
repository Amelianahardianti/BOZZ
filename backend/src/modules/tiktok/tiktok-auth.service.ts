import { env } from "../../config/env";
import { getPlatformToken, upsertPlatformToken, PLATFORM_TIKTOK } from "../platforms/token-store";
import { getAuthorizedShops } from "./tiktok-api.client";

const TOKEN_GET_PATH = "/api/v2/token/get";
const TOKEN_REFRESH_PATH = "/api/v2/token/refresh";
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

/**
 * Authorization URL TikTok Shop diterbitkan lewat App milikmu di Partner Center —
 * isi TIKTOK_AUTH_HOST di .env dengan URL yang tertera di sana (biasanya berbentuk
 * https://services.tiktokshop.com/open/authorize?service_id=...).
 */
export function buildAuthorizationUrl(state?: string): string {
  const url = new URL(env.tiktokAuthHost);
  url.searchParams.set("service_id", env.tiktokServiceId);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Token get/refresh TikTok Shop v2 tidak pakai signature (mirip Shopee GetAccessToken) —
 * cukup app_key + app_secret + auth_code/refresh_token di query.
 * Setelah dapat access_token, shop_cipher diambil lewat getAuthorizedShops (shop_id belum
 * diketahui dari callback saja) lalu disimpan sebagai shop_id_external di tabel platforms.
 */
export async function exchangeCodeForToken(authCode: string) {
  const url = new URL(env.tiktokHost + TOKEN_GET_PATH);
  url.searchParams.set("app_key", env.tiktokAppKey);
  url.searchParams.set("app_secret", env.tiktokAppSecret);
  url.searchParams.set("auth_code", authCode);
  url.searchParams.set("grant_type", "authorized_code");

  const res = await fetch(url.toString());
  const data = (await res.json()) as TokenResponse;
  if (!data.data) throw new Error(`TikTok token/get error: ${data.code} - ${data.message}`);

  const shopsResult = await getAuthorizedShops(data.data.access_token);
  const shop = shopsResult.data?.shops[0];
  if (!shop) throw new Error("TikTok authorization succeeded but no authorized shop was returned");

  const expiresAt = new Date(Date.now() + data.data.access_token_expire_in * 1000);
  await upsertPlatformToken(PLATFORM_TIKTOK, {
    shopIdExternal: shop.cipher,
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    expiresAt,
  });

  return { shopIdExternal: shop.cipher, expiresAt };
}

async function refreshAccessToken(refreshToken: string) {
  const url = new URL(env.tiktokHost + TOKEN_REFRESH_PATH);
  url.searchParams.set("app_key", env.tiktokAppKey);
  url.searchParams.set("app_secret", env.tiktokAppSecret);
  url.searchParams.set("refresh_token", refreshToken);
  url.searchParams.set("grant_type", "refresh_token");

  const res = await fetch(url.toString());
  const data = (await res.json()) as TokenResponse;
  if (!data.data) throw new Error(`TikTok token/refresh error: ${data.code} - ${data.message}`);

  const existing = await getPlatformToken(PLATFORM_TIKTOK);
  const expiresAt = new Date(Date.now() + data.data.access_token_expire_in * 1000);
  await upsertPlatformToken(PLATFORM_TIKTOK, {
    shopIdExternal: existing?.shopIdExternal ?? "",
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    expiresAt,
  });

  return { shopIdExternal: existing?.shopIdExternal ?? "", accessToken: data.data.access_token };
}

export async function getValidAccessToken() {
  const token = await getPlatformToken(PLATFORM_TIKTOK);
  if (!token) {
    throw new Error("No TikTok shop connected yet — authorize via /api/platforms/tiktok/connect first");
  }

  const isExpiringSoon = token.expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;
  if (!isExpiringSoon) {
    return { shopIdExternal: token.shopIdExternal, accessToken: token.accessToken };
  }

  return refreshAccessToken(token.refreshToken);
}
