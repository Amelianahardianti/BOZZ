import { prisma } from "../../db/prisma.client";
import { env } from "../../config/env";
import { buildPublicApiBaseString, sign } from "./shopee-signature.util";

const GET_ACCESS_TOKEN_PATH = "/api/v2/auth/token/get";
const REFRESH_ACCESS_TOKEN_PATH = "/api/v2/auth/access_token/get";

// (rekomendasi) refresh dilakukan lebih awal dari waktu expired sesungguhnya, supaya tidak ada
// request order yang gagal karena token kadaluarsa persis di tengah proses sync.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface GetAccessTokenResponse {
  request_id: string;
  error: string;
  message: string;
  access_token?: string;
  refresh_token?: string;
  expire_in?: number;
}

/**
 * Builds the Shopee seller authorization link.
 * Per "Authorization and Authentication" docs: fixed auth host + partner_id, auth_type,
 * redirect_uri, response_type=code (no signature required for this link).
 */
export function buildAuthorizationUrl(state?: string): string {
  const url = new URL(env.shopeeAuthHost);
  url.searchParams.set("partner_id", env.shopeePartnerId);
  url.searchParams.set("auth_type", "seller");
  url.searchParams.set("redirect_uri", env.shopeeRedirectUri);
  url.searchParams.set("response_type", "code");
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Exchanges the authorization `code` + `shop_id` for access_token/refresh_token
 * via GetAccessToken (POST /api/v2/auth/token/get), then persists it.
 */
export async function exchangeCodeForToken(code: string, shopId: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = buildPublicApiBaseString(env.shopeePartnerId, GET_ACCESS_TOKEN_PATH, timestamp);
  const requestSign = sign(baseString, env.shopeePartnerKey);

  const url = new URL(env.shopeeHost + GET_ACCESS_TOKEN_PATH);
  url.searchParams.set("partner_id", env.shopeePartnerId);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", requestSign);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      shop_id: Number(shopId),
      partner_id: Number(env.shopeePartnerId),
    }),
  });

  const data = (await res.json()) as GetAccessTokenResponse;

  if (data.error) {
    throw new Error(`Shopee GetAccessToken error: ${data.error} - ${data.message}`);
  }
  if (!data.access_token || !data.refresh_token || !data.expire_in) {
    throw new Error("Shopee GetAccessToken response missing token fields");
  }

  const expiresAt = new Date(Date.now() + data.expire_in * 1000);

  await prisma.shopeeToken.upsert({
    where: { shopId },
    update: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt },
    create: { shopId, accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt },
  });

  return { shopId, expiresAt };
}

export async function getConnectionStatus() {
  const token = await prisma.shopeeToken.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!token) return { connected: false as const };
  return { connected: true as const, shopId: token.shopId, expiresAt: token.expiresAt };
}

/**
 * Calls RefreshAccessToken (POST /api/v2/auth/access_token/get). Per docs, its common
 * parameters are "consistent with GetAccessToken" — i.e. Public API base string
 * (partner_id + api_path + timestamp), NOT the Shop API base string.
 */
async function refreshAccessToken(shopId: string, refreshToken: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = buildPublicApiBaseString(env.shopeePartnerId, REFRESH_ACCESS_TOKEN_PATH, timestamp);
  const requestSign = sign(baseString, env.shopeePartnerKey);

  const url = new URL(env.shopeeHost + REFRESH_ACCESS_TOKEN_PATH);
  url.searchParams.set("partner_id", env.shopeePartnerId);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", requestSign);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
      shop_id: Number(shopId),
      partner_id: Number(env.shopeePartnerId),
    }),
  });

  const data = (await res.json()) as GetAccessTokenResponse;

  if (data.error) {
    throw new Error(`Shopee RefreshAccessToken error: ${data.error} - ${data.message}`);
  }
  if (!data.access_token || !data.refresh_token || !data.expire_in) {
    throw new Error("Shopee RefreshAccessToken response missing token fields");
  }

  const expiresAt = new Date(Date.now() + data.expire_in * 1000);

  return prisma.shopeeToken.update({
    where: { shopId },
    data: { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt },
  });
}

/**
 * Returns a usable {shopId, accessToken} for calling Shop APIs, refreshing first if the
 * stored token is expired (or close to it). Throws if no shop has been authorized yet.
 */
export async function getValidAccessToken() {
  const token = await prisma.shopeeToken.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!token) {
    throw new Error("No Shopee shop connected yet — authorize via /api/shopee/authorize first");
  }

  const isExpiringSoon = token.expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;
  if (!isExpiringSoon) {
    return { shopId: token.shopId, accessToken: token.accessToken };
  }

  const refreshed = await refreshAccessToken(token.shopId, token.refreshToken);
  return { shopId: refreshed.shopId, accessToken: refreshed.accessToken };
}
