import { createHmac } from 'crypto';

/** Base string GetAccessToken/RefreshAccessToken (Public API): partner_id + api_path + timestamp. */
export function buildPublicApiBaseString(partnerId: string, path: string, timestamp: number): string {
  return `${partnerId}${path}${timestamp}`;
}

/** Base string Shop API (order list/detail dll): partner_id + api_path + timestamp + access_token + shop_id. */
export function buildShopApiBaseString(
  partnerId: string,
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: string
): string {
  return `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
}

export function sign(baseString: string, partnerKey: string): string {
  return createHmac('sha256', partnerKey).update(baseString).digest('hex');
}
