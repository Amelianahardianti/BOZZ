import { getAdapter, platformAdapters, isPlatformConfigured } from "./platforms.registry";
import { listPlatformsSummary, disconnectPlatform, markSyncResult, getPlatformRow } from "./token-store";
import { upsertExternalOrder } from "../orders/external-order.service";

// ponytail: window sync tetap (seperti PoC Shopee lama) — jadikan configurable per platform
// kalau nanti butuh backfill lebih dalam dari 15 hari.
const SYNC_LOOKBACK_SECONDS = 15 * 24 * 60 * 60;

export async function listPlatforms() {
  const connectedRows = await listPlatformsSummary();
  const byName = new Map(connectedRows.map((row) => [row.platform, row]));

  // Tampilkan semua adapter yang terdaftar, termasuk yang belum pernah di-connect
  // sama sekali — biar Shopee/TikTok tetap muncul sebagai NOT_CONFIGURED, bukan hilang.
  return Object.keys(platformAdapters).map((platform) => {
    const row = byName.get(platform);
    const configured = isPlatformConfigured(platform);
    return {
      platform,
      configured,
      status: !configured ? ("not_configured" as const) : row?.connected ? ("connected" as const) : ("disconnected" as const),
      connected: row?.connected ?? false,
      shopId: row?.shopId ?? null,
      lastSyncedAt: row?.lastSyncedAt ?? null,
      lastSyncStatus: row?.lastSyncStatus ?? null,
    };
  });
}

export function getAuthorizationUrl(platformName: string, state?: string) {
  return getAdapter(platformName).buildAuthorizationUrl(state);
}

export async function handleConnectCallback(platformName: string, code: string, shopIdExternal?: string) {
  return getAdapter(platformName).exchangeCodeForToken(code, shopIdExternal);
}

export async function disconnect(platformName: string) {
  await disconnectPlatform(platformName);
}

export async function syncPlatform(platformName: string) {
  const adapter = getAdapter(platformName);
  const platformRow = await getPlatformRow(platformName);
  if (!platformRow || !platformRow.is_connected) {
    throw new Error(`Platform "${platformName}" is not connected yet`);
  }

  try {
    const creds = await adapter.getValidAccessToken();
    const orders = await adapter.fetchRecentOrders(creds, SYNC_LOOKBACK_SECONDS);

    let created = 0;
    let updated = 0;
    for (const order of orders) {
      const result = await upsertExternalOrder(platformRow.id, platformName, order);
      if (result.created) created++;
      else updated++;
    }

    await markSyncResult(platformName, "success");
    return { synced: orders.length, created, updated };
  } catch (err) {
    await markSyncResult(platformName, "failed");
    throw err;
  }
}
