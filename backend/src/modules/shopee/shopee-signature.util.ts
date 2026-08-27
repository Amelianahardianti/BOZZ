import { createHmac } from "crypto";

/**
 * Public API base string: partner_id + api_path + timestamp
 * (no access_token/shop_id yet — used for GetAccessToken per docs).
 */
export function buildPublicApiBaseString(partnerId: string, apiPath: string, timestamp: number): string {
  return `${partnerId}${apiPath}${timestamp}`;
}

/**
 * Shop API base string: partner_id + api_path + timestamp + access_token + shop_id
 * (used for get_order_list, get_order_detail — APIs that require an access_token).
 */
export function buildShopApiBaseString(
  partnerId: string,
  apiPath: string,
  timestamp: number,
  accessToken: string,
  shopId: string
): string {
  return `${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`;
}

export function sign(baseString: string, partnerKey: string): string {
  return createHmac("sha256", partnerKey).update(baseString).digest("hex");
}
